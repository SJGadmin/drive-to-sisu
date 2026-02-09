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
      </Head>

      <div className="container">
        <main className="main">
          <h1 className="title">SISU Document Automation</h1>
          <p className="subtitle">Upload documents from Google Drive to SISU automatically</p>

          <div className="actions-grid">
            {/* Upload Documents by Transaction ID */}
            <div className="action-card">
              <div className="action-icon">📤</div>
              <h2>Upload Documents</h2>
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
                {singleUploadLoading ? 'Uploading...' : 'Upload Documents'}
              </button>
            </div>

            {/* Remove _UPLOADED Suffix by Transaction ID */}
            <div className="action-card">
              <div className="action-icon">🔄</div>
              <h2>Remove Upload Suffix</h2>
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
                {removeLoading ? 'Removing...' : 'Remove Suffix'}
              </button>
            </div>
          </div>

          {/* Loading State */}
          {isAnyLoading && (
            <div className="status-box loading-box">
              <div className="spinner"></div>
              <p>{loadingMessage}</p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="status-box error-box">
              <h3>❌ Error</h3>
              <p>{error}</p>
            </div>
          )}

          {/* Results */}
          {result && result.type === 'single-upload' && (
            <div className="status-box success-box">
              <h3>✅ Upload Complete!</h3>
              <div className="result-stats">
                <p><strong>Transaction ID:</strong> {result.data.transactionId}</p>
                <p><strong>Address:</strong> {result.data.address || 'N/A'}</p>
                <p><strong>Documents Uploaded:</strong> {result.data.documentsUploaded || 0}</p>
                {result.data.documentsUploaded === 0 && (
                  <p className="warning-text">No new documents found for this transaction</p>
                )}
              </div>
              <p className="info-text">Check Google Sheets for detailed logs</p>
            </div>
          )}

          {result && result.type === 'remove' && (
            <div className="status-box success-box">
              <h3>✅ Suffix Removed!</h3>
              <div className="result-stats">
                <p><strong>Transaction ID:</strong> {result.data.transactionId}</p>
                <p><strong>Folders Processed:</strong> {result.data.foldersProcessed || 0}</p>
                <p><strong>Files Renamed:</strong> {result.data.filesRenamed || 0}</p>
              </div>
              {result.data.filesRenamed > 0 && (
                <p className="info-text">Files are ready to be uploaded again!</p>
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
            padding: 2rem;
            background: #000000;
          }

          .main {
            max-width: 1200px;
            margin: 0 auto;
          }

          .title {
            text-align: center;
            color: #FFFFFF;
            font-size: 3rem;
            margin: 0 0 0.5rem;
            font-weight: 700;
          }

          .subtitle {
            text-align: center;
            color: #FFFFFF;
            font-size: 1.2rem;
            margin: 0 0 3rem;
            opacity: 0.7;
          }

          .actions-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 2rem;
            margin-bottom: 2rem;
          }

          .action-card {
            background: #E7E6E2;
            border-radius: 16px;
            padding: 2rem;
            box-shadow: 0 4px 16px rgba(56, 182, 255, 0.1);
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            transition: all 0.3s ease;
            border: 2px solid transparent;
          }

          .action-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 8px 24px rgba(56, 182, 255, 0.3);
            border-color: #38B6FF;
          }

          .action-icon {
            font-size: 3rem;
            margin-bottom: 1rem;
          }

          .action-card h2 {
            color: #000000;
            font-size: 1.5rem;
            margin: 0 0 0.5rem;
            font-weight: 600;
          }

          .action-card p {
            color: #000000;
            font-size: 0.95rem;
            margin: 0 0 1.5rem;
            line-height: 1.5;
            opacity: 0.7;
          }

          .text-input {
            width: 100%;
            padding: 0.75rem;
            border: 2px solid #000000;
            border-radius: 8px;
            font-size: 1rem;
            margin-bottom: 1rem;
            transition: border-color 0.2s;
            background: #FFFFFF;
            color: #000000;
          }

          .text-input:focus {
            outline: none;
            border-color: #38B6FF;
          }

          .text-input:disabled {
            background: #FFFFFF;
            opacity: 0.6;
            cursor: not-allowed;
          }

          .action-button {
            width: 100%;
            padding: 0.875rem 1.5rem;
            border: none;
            border-radius: 8px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            color: white;
          }

          .action-button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .action-button.primary {
            background: #38B6FF;
          }

          .action-button.primary:hover:not(:disabled) {
            background: #2da3eb;
            box-shadow: 0 4px 12px rgba(56, 182, 255, 0.4);
          }

          .action-button.secondary {
            background: #FFFFFF;
            color: #000000;
          }

          .action-button.secondary:hover:not(:disabled) {
            background: #E7E6E2;
            box-shadow: 0 4px 12px rgba(255, 255, 255, 0.2);
          }

          .status-box {
            background: #E7E6E2;
            border-radius: 16px;
            padding: 2rem;
            box-shadow: 0 8px 24px rgba(56, 182, 255, 0.1);
            margin-top: 2rem;
          }

          .loading-box {
            text-align: center;
          }

          .spinner {
            border: 4px solid #FFFFFF;
            border-top: 4px solid #38B6FF;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            animation: spin 1s linear infinite;
            margin: 0 auto 1rem;
          }

          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }

          .success-box h3 {
            color: #38B6FF;
            margin-top: 0;
          }

          .error-box h3 {
            color: #000000;
            margin-top: 0;
          }

          .result-stats {
            background: #FFFFFF;
            border-radius: 8px;
            padding: 1.5rem;
            margin: 1rem 0;
          }

          .result-stats p {
            margin: 0.5rem 0;
            color: #000000;
          }

          .info-text {
            text-align: center;
            color: #000000;
            font-style: italic;
            margin-top: 1rem;
            opacity: 0.7;
          }

          .warning-text {
            text-align: center;
            color: #000000;
            font-weight: 500;
            margin-top: 1rem;
          }

          @media (max-width: 768px) {
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
            font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto,
              Oxygen, Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue,
              sans-serif;
          }
        `}</style>
      </div>
    </>
  );
}
