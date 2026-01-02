/**
 * In-memory cache for email-to-folder mappings
 * Dramatically speeds up single client lookups by avoiding sequential Google Drive file reads
 */

class ClientCache {
  constructor() {
    this.cache = new Map(); // email -> { folderId, folderName, sisuIdFileId }
    this.lastRefreshTime = null;
    this.isRefreshing = false;
    this.refreshPromise = null;
  }

  /**
   * Get folder info for a specific email (case-insensitive)
   * @param {string} email - Client email address
   * @returns {Object|null} Folder info or null if not found
   */
  get(email) {
    if (!email) return null;
    const normalizedEmail = email.trim().toLowerCase();
    return this.cache.get(normalizedEmail) || null;
  }

  /**
   * Set folder info for a specific email
   * @param {string} email - Client email address
   * @param {Object} folderInfo - { folderId, folderName, sisuIdFileId }
   */
  set(email, folderInfo) {
    if (!email) return;
    const normalizedEmail = email.trim().toLowerCase();
    this.cache.set(normalizedEmail, folderInfo);
  }

  /**
   * Check if cache has been initialized
   * @returns {boolean}
   */
  isInitialized() {
    return this.cache.size > 0 && this.lastRefreshTime !== null;
  }

  /**
   * Get cache statistics
   * @returns {Object}
   */
  getStats() {
    return {
      size: this.cache.size,
      lastRefreshTime: this.lastRefreshTime,
      ageInMinutes: this.lastRefreshTime
        ? Math.floor((Date.now() - this.lastRefreshTime) / 60000)
        : null,
    };
  }

  /**
   * Clear the entire cache
   */
  clear() {
    this.cache.clear();
    this.lastRefreshTime = null;
  }

  /**
   * Build the cache by reading all SISU_ID files from Google Drive
   * @param {Object} drive - Google Drive API client
   * @param {string} parentFolderId - Root folder ID containing client folders
   * @param {Function} progressCallback - Optional callback(current, total, email)
   * @returns {Object} Statistics about the refresh operation
   */
  async refresh(drive, parentFolderId, progressCallback = null) {
    // Prevent concurrent refreshes
    if (this.isRefreshing) {
      console.log('Cache refresh already in progress, waiting...');
      return await this.refreshPromise;
    }

    this.isRefreshing = true;
    const startTime = Date.now();

    this.refreshPromise = this._doRefresh(drive, parentFolderId, progressCallback);

    try {
      const result = await this.refreshPromise;
      return result;
    } finally {
      this.isRefreshing = false;
      this.refreshPromise = null;
    }
  }

  async _doRefresh(drive, sharedDriveId, progressCallback) {
    console.log('Starting cache refresh...');
    const startTime = Date.now();

    try {
      // Step 1: Get all client folders
      const folders = await this._getAllClientFolders(drive, sharedDriveId);
      console.log(`Found ${folders.length} client folders`);

      // Step 2: Clear existing cache
      this.cache.clear();

      // Step 3: Read each SISU_ID file and build the cache
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < folders.length; i++) {
        const folder = folders[i];

        if (progressCallback) {
          progressCallback(i + 1, folders.length, null);
        }

        try {
          const email = await this._readClientEmail(drive, folder.sisuIdFileId);

          if (email) {
            this.set(email, {
              folderId: folder.folderId,
              folderName: folder.folderName,
              sisuIdFileId: folder.sisuIdFileId,
            });
            successCount++;

            if (progressCallback) {
              progressCallback(i + 1, folders.length, email);
            }
          }
        } catch (error) {
          errorCount++;
          console.error(`Failed to read SISU_ID for folder ${folder.folderName}:`, error.message);
        }
      }

      this.lastRefreshTime = Date.now();
      const duration = Date.now() - startTime;

      const stats = {
        totalFolders: folders.length,
        successCount,
        errorCount,
        cacheSize: this.cache.size,
        durationMs: duration,
        durationSeconds: (duration / 1000).toFixed(2),
      };

      console.log(`Cache refresh completed in ${stats.durationSeconds}s`);
      console.log(`  Cached: ${successCount} clients`);
      console.log(`  Errors: ${errorCount}`);

      return stats;
    } catch (error) {
      console.error('Cache refresh failed:', error);
      throw error;
    }
  }

  /**
   * Get all client folders containing SISU_ID files
   * @private
   */
  async _getAllClientFolders(drive, sharedDriveId) {
    const folders = [];

    // Search for all SISU_ID files in the entire shared drive
    const sisuIdQuery = "name='SISU_ID' and trashed=false and mimeType='application/vnd.google-apps.document'";

    let pageToken = null;
    do {
      const response = await drive.files.list({
        q: sisuIdQuery,
        driveId: sharedDriveId,
        corpora: 'drive',
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        fields: 'nextPageToken, files(id, name, parents)',
        pageSize: 1000,
        pageToken: pageToken,
      });

      const sisuIdFiles = response.data.files || [];

      // For each SISU_ID file, get the parent folder info
      for (const file of sisuIdFiles) {
        if (file.parents && file.parents.length > 0) {
          const folderId = file.parents[0];

          try {
            const folderResponse = await drive.files.get({
              fileId: folderId,
              fields: 'id, name',
              supportsAllDrives: true,
            });

            folders.push({
              folderId: folderId,
              folderName: folderResponse.data.name,
              sisuIdFileId: file.id,
            });
          } catch (error) {
            console.error(`Failed to get folder info for ${folderId}:`, error.message);
          }
        }
      }

      pageToken = response.data.nextPageToken;
    } while (pageToken);

    return folders;
  }

  /**
   * Read client email from SISU_ID Google Doc file
   * @private
   */
  async _readClientEmail(drive, sisuIdFileId) {
    try {
      const response = await drive.files.export({
        fileId: sisuIdFileId,
        mimeType: 'text/plain',
      });

      const content = response.data;
      if (!content || typeof content !== 'string') {
        return null;
      }

      const email = content.trim();
      return email || null;
    } catch (error) {
      throw new Error(`Failed to read SISU_ID file: ${error.message}`);
    }
  }
}

// Export singleton instance
const clientCache = new ClientCache();

module.exports = clientCache;
