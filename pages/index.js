import { useState, useEffect } from 'react';
import Head from 'next/head';

export default function Home() {
  const [singleUploadLoading, setSingleUploadLoading] = useState(false);
  const [removeLoading, setRemoveLoading] = useState(false);
  const [transactionId, setTransactionId] = useState('');
  const [removeTransactionId, setRemoveTransactionId] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loadingMessage, setLoadingMessage] = useState('Processing...');

  // Timer for loading messages
  useEffect(() => {
    const isLoading = singleUploadLoading || removeLoading;

    if (!isLoading) {
      setLoadingMessage('Processing...');
      return;
    }

    setLoadingMessage('Processing...');

    const timer1 = setTimeout(() => {
      setLoadingMessage('I promise it is working');
    }, 60000); // 1 minute

    const timer2 = setTimeout(() => {
      setLoadingMessage('No seriously, trust me, it is working');
    }, 120000); // 2 minutes

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [singleUploadLoading, removeLoading]);

  const handleSingleClientUpload = async () => {
    if (!transactionId.trim()) {
      setError('Please enter a SISU Transaction ID');
      return;
    }

    setSingleUploadLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/upload-single-client', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transactionId: transactionId.trim() }),
      });

      const data = await response.json();

      if (response.ok) {
        setResult({ type: 'single-upload', data });
        setTransactionId('');
      } else {
        setError(data.error || 'An error occurred');
      }
    } catch (err) {
      setError(err.message || 'Failed to connect to API');
    } finally {
      setSingleUploadLoading(false);
    }
  };

  const handleRemoveSuffix = async () => {
    if (!removeTransactionId.trim()) {
      setError('Please enter a SISU Transaction ID');
      return;
    }

    setRemoveLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/remove-suffix', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transactionId: removeTransactionId.trim() }),
      });

      const data = await response.json();

      if (response.ok) {
        setResult({ type: 'remove', data });
        setRemoveTransactionId('');
      } else {
        setError(data.error || 'An error occurred');
      }
    } catch (err) {
      setError(err.message || 'Failed to connect to API');
    } finally {
      setRemoveLoading(false);
    }
  };

  const isAnyLoading = singleUploadLoading || removeLoading;

  return (
    <>
      <Head>
        <title>SISU Document Automation</title>
        <meta name="description" content="Automated Google Drive to SISU document uploads" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>

      <div className="container">
        <main className="main">
          <div className="header">
            <span className="eyebrow">AUTOMATION TOOLS</span>
            <h1 className="title">SISU Document Automation</h1>
            <p className="subtitle">Upload documents from Google Drive to SISU automatically</p>
          </div>

          <div className="actions-grid">
            {/* Upload Documents by Transaction ID */}
            <div className="action-card">
              <div className="card-header">
                <div className="action-icon">📤</div>
                <h2>Upload Documents</h2>
              </div>
              <p>Upload all new PDFs from Google Drive to a SISU transaction</p>
              <input
                type="text"
                placeholder="SISU Transaction ID (e.g. 6284412)"
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                className="text-input"
                disabled={isAnyLoading}
              />
              <button
                className="action-button primary"
                onClick={handleSingleClientUpload}
                disabled={isAnyLoading || !transactionId.trim()}
              >
                {singleUploadLoading ? (
                  <span className="btn-loading"><span className="btn-spinner" />Uploading...</span>
                ) : 'Upload Documents'}
              </button>
            </div>

            {/* Remove _UPLOADED Suffix by Transaction ID */}
            <div className="action-card">
              <div className="card-header">
                <div className="action-icon">🔄</div>
                <h2>Remove Upload Suffix</h2>
              </div>
              <p>Remove _UPLOADED.pdf suffix to re-upload files for a transaction</p>
              <input
                type="text"
                placeholder="SISU Transaction ID (e.g. 6284412)"
                value={removeTransactionId}
                onChange={(e) => setRemoveTransactionId(e.target.value)}
                className="text-input"
                disabled={isAnyLoading}
              />
              <button
                className="action-button secondary"
                onClick={handleRemoveSuffix}
                disabled={isAnyLoading || !removeTransactionId.trim()}
              >
                {removeLoading ? (
                  <span className="btn-loading"><span className="btn-spinner secondary" />Removing...</span>
                ) : 'Remove Suffix'}
              </button>
            </div>
          </div>

          {/* Loading State */}
          {isAnyLoading && (
            <div className="status-box loading-box">
              <div className="spinner"></div>
              <p className="loading-text">{loadingMessage}</p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="status-box error-box">
              <h3>Error</h3>
              <p>{error}</p>
            </div>
          )}

          {/* Results */}
          {result && result.type === 'single-upload' && (
            <div className="status-box success-box">
              <h3>Upload Complete</h3>
              <div className="result-stats">
                <div className="stat-row">
                  <span className="stat-label">Transaction ID</span>
                  <span className="stat-value">{result.data.transactionId}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Address</span>
                  <span className="stat-value">{result.data.address || 'N/A'}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Documents Uploaded</span>
                  <span className="stat-value accent">{result.data.documentsUploaded || 0}</span>
                </div>
                {result.data.documentsUploaded === 0 && (
                  <p className="warning-text">No new documents found for this transaction</p>
                )}
              </div>
              <p className="info-text">Check Google Sheets for detailed logs</p>
            </div>
          )}

          {result && result.type === 'remove' && (
            <div className="status-box success-box">
              <h3>Suffix Removed</h3>
              <div className="result-stats">
                <div className="stat-row">
                  <span className="stat-label">Transaction ID</span>
                  <span className="stat-value">{result.data.transactionId}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Folders Processed</span>
                  <span className="stat-value accent">{result.data.foldersProcessed || 0}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Files Renamed</span>
                  <span className="stat-value accent">{result.data.filesRenamed || 0}</span>
                </div>
              </div>
              {result.data.filesRenamed > 0 && (
                <p className="info-text">Files are ready to be uploaded again</p>
              )}
              {result.data.foldersProcessed === 0 && (
                <p className="warning-text">No folders found for this transaction ID</p>
              )}
            </div>
          )}
        </main>

        <style jsx>{`
          .container {
            min-height: 100vh;
            padding: 3rem 2rem 4rem;
            background: #0f0f11;
          }

          .main {
            max-width: 900px;
            margin: 0 auto;
          }

          .header {
            text-align: center;
            margin-bottom: 3.5rem;
          }

          .eyebrow {
            display: inline-block;
            font-size: 0.7rem;
            font-weight: 600;
            letter-spacing: 0.15em;
            text-transform: uppercase;
            color: #7c3aed;
            margin-bottom: 1rem;
            opacity: 0.9;
          }

          .title {
            color: #f0eeff;
            font-size: 2.75rem;
            margin: 0 0 0.75rem;
            font-weight: 700;
            letter-spacing: -0.02em;
            line-height: 1.1;
          }

          .subtitle {
            color: rgba(226, 232, 240, 0.5);
            font-size: 1rem;
            margin: 0;
            line-height: 1.6;
          }

          .actions-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 1.5rem;
            margin-bottom: 1.5rem;
          }

          .action-card {
            background: #1a1a1f;
            border-radius: 16px;
            padding: 1.75rem;
            border: 1px solid rgba(255, 255, 255, 0.08);
            display: flex;
            flex-direction: column;
            transition: border-color 0.2s ease, box-shadow 0.2s ease;
          }

          .action-card:hover {
            border-color: rgba(124, 58, 237, 0.4);
            box-shadow: 0 0 0 1px rgba(124, 58, 237, 0.15), 0 8px 32px rgba(124, 58, 237, 0.08);
          }

          .card-header {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            margin-bottom: 0.6rem;
          }

          .action-icon {
            font-size: 1.4rem;
            line-height: 1;
          }

          .action-card h2 {
            color: #e2e8f0;
            font-size: 1.1rem;
            margin: 0;
            font-weight: 600;
            letter-spacing: -0.01em;
          }

          .action-card p {
            color: rgba(226, 232, 240, 0.5);
            font-size: 0.875rem;
            margin: 0 0 1.25rem;
            line-height: 1.6;
          }

          .text-input {
            width: 100%;
            padding: 0.7rem 0.875rem;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            font-size: 0.9rem;
            margin-bottom: 0.875rem;
            transition: border-color 0.15s ease, box-shadow 0.15s ease;
            background: rgba(255, 255, 255, 0.05);
            color: #e2e8f0;
            font-family: inherit;
          }

          .text-input::placeholder {
            color: rgba(226, 232, 240, 0.3);
          }

          .text-input:focus {
            outline: none;
            border-color: #7c3aed;
            box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.15);
          }

          .text-input:disabled {
            opacity: 0.4;
            cursor: not-allowed;
          }

          .action-button {
            width: 100%;
            padding: 0.75rem 1.25rem;
            border: none;
            border-radius: 10px;
            font-size: 0.9rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s ease;
            font-family: inherit;
            letter-spacing: -0.01em;
            margin-top: auto;
          }

          .action-button:disabled {
            opacity: 0.35;
            cursor: not-allowed;
            transform: none !important;
            box-shadow: none !important;
          }

          .action-button.primary {
            background: linear-gradient(135deg, #7c3aed, #6d28d9);
            color: #fff;
          }

          .action-button.primary:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow: 0 4px 20px rgba(124, 58, 237, 0.45);
          }

          .action-button.primary:active:not(:disabled) {
            transform: translateY(0);
          }

          .action-button.secondary {
            background: rgba(255, 255, 255, 0.07);
            color: #e2e8f0;
            border: 1px solid rgba(255, 255, 255, 0.12);
          }

          .action-button.secondary:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.11);
            transform: translateY(-1px);
          }

          .action-button.secondary:active:not(:disabled) {
            transform: translateY(0);
          }

          .btn-loading {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
          }

          .btn-spinner {
            display: inline-block;
            width: 14px;
            height: 14px;
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-top-color: #fff;
            border-radius: 50%;
            animation: spin 0.7s linear infinite;
          }

          .btn-spinner.secondary {
            border-color: rgba(226, 232, 240, 0.3);
            border-top-color: #e2e8f0;
          }

          .status-box {
            border-radius: 16px;
            padding: 1.75rem;
            margin-top: 1.5rem;
            border: 1px solid rgba(255, 255, 255, 0.08);
            background: #1a1a1f;
          }

          .loading-box {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1rem;
            padding: 2.5rem;
          }

          .spinner {
            border: 2px solid rgba(255, 255, 255, 0.08);
            border-top: 2px solid #7c3aed;
            border-radius: 50%;
            width: 36px;
            height: 36px;
            animation: spin 0.8s linear infinite;
          }

          .loading-text {
            color: rgba(226, 232, 240, 0.5);
            font-size: 0.9rem;
            margin: 0;
          }

          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }

          .success-box {
            border-left: 3px solid #10b981;
          }

          .success-box h3 {
            color: #10b981;
            margin: 0 0 1rem;
            font-size: 1rem;
            font-weight: 600;
            letter-spacing: -0.01em;
          }

          .error-box {
            border-left: 3px solid #ef4444;
          }

          .error-box h3 {
            color: #ef4444;
            margin: 0 0 0.5rem;
            font-size: 1rem;
            font-weight: 600;
          }

          .error-box p {
            color: rgba(226, 232, 240, 0.7);
            margin: 0;
            font-size: 0.9rem;
          }

          .result-stats {
            background: rgba(255, 255, 255, 0.04);
            border-radius: 10px;
            padding: 1rem 1.25rem;
            margin-bottom: 1rem;
            border: 1px solid rgba(255, 255, 255, 0.06);
          }

          .stat-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.4rem 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          }

          .stat-row:last-child {
            border-bottom: none;
          }

          .stat-label {
            color: rgba(226, 232, 240, 0.5);
            font-size: 0.85rem;
          }

          .stat-value {
            color: #e2e8f0;
            font-size: 0.85rem;
            font-weight: 500;
          }

          .stat-value.accent {
            color: #a78bfa;
            font-weight: 600;
          }

          .info-text {
            color: rgba(226, 232, 240, 0.4);
            font-size: 0.8rem;
            font-style: italic;
            margin: 0;
            text-align: center;
          }

          .warning-text {
            color: #fbbf24;
            font-size: 0.85rem;
            font-weight: 500;
            margin: 0.75rem 0 0;
            text-align: center;
          }

          @media (max-width: 768px) {
            .container {
              padding: 2rem 1.25rem 3rem;
            }

            .title {
              font-size: 2rem;
            }

            .actions-grid {
              grid-template-columns: 1fr;
            }
          }
        `}</style>

        <style jsx global>{`
          * {
            box-sizing: border-box;
          }

          html,
          body {
            padding: 0;
            margin: 0;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, Segoe UI, Roboto,
              Oxygen, Ubuntu, Cantarell, sans-serif;
            background: #0f0f11;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
          }
        `}</style>
      </div>
    </>
  );
}
