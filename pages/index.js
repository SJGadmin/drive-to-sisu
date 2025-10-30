import { useState } from 'react';
import Head from 'next/head';

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleRunUpload = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/run-upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (response.ok) {
        setResult(data);
      } else {
        setError(data.error || 'An error occurred');
      }
    } catch (err) {
      setError(err.message || 'Failed to connect to API');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>SISU Document Upload Automation</title>
        <meta name="description" content="Automated Google Drive to SISU document uploads" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="container">
        <main className="main">
          <h1 className="title">SISU Document Upload Automation</h1>

          <p className="description">
            Click the button below to trigger the automated document upload process.
            This will search your Google Drive for new PDFs and upload them to SISU.
          </p>

          <button
            className={`trigger-button ${loading ? 'loading' : ''}`}
            onClick={handleRunUpload}
            disabled={loading}
          >
            {loading ? 'Processing...' : 'Run Upload Process'}
          </button>

          {loading && (
            <div className="status-box loading-box">
              <div className="spinner"></div>
              <p>Scanning Google Drive and uploading documents...</p>
            </div>
          )}

          {error && (
            <div className="status-box error-box">
              <h2>Error</h2>
              <p>{error}</p>
            </div>
          )}

          {result && (
            <div className="status-box success-box">
              <h2>Upload Complete!</h2>

              <div className="summary">
                <div className="summary-item success">
                  <span className="summary-number">{result.summary?.totalSuccessful || 0}</span>
                  <span className="summary-label">Documents Uploaded</span>
                </div>
                <div className="summary-item error">
                  <span className="summary-number">{result.summary?.totalFailed || 0}</span>
                  <span className="summary-label">Failed Uploads</span>
                </div>
              </div>

              {result.successfulUploads && result.successfulUploads.length > 0 && (
                <div className="details">
                  <h3>Successful Uploads</h3>
                  <ul>
                    {result.successfulUploads.map((upload, index) => (
                      <li key={index}>
                        <strong>{upload.driveFileName}</strong> → Client: {upload.clientEmail}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.failures && result.failures.length > 0 && (
                <div className="details failures">
                  <h3>Failed Uploads</h3>
                  <ul>
                    {result.failures.map((failure, index) => (
                      <li key={index}>
                        <strong>{failure.fileName || failure.folderName}</strong>
                        <br />
                        <span className="error-message">{failure.error}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="note">Errors have been logged to the Google Sheet: SISU_Upload_Errors</p>
                </div>
              )}
            </div>
          )}
        </main>

        <style jsx>{`
          .container {
            min-height: 100vh;
            padding: 0 0.5rem;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          }

          .main {
            padding: 3rem 0;
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            max-width: 800px;
            width: 100%;
          }

          .title {
            margin: 0 0 1rem;
            line-height: 1.15;
            font-size: 3rem;
            text-align: center;
            color: white;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
          }

          .description {
            text-align: center;
            line-height: 1.5;
            font-size: 1.2rem;
            color: rgba(255, 255, 255, 0.9);
            margin-bottom: 2rem;
            max-width: 600px;
          }

          .trigger-button {
            background: white;
            color: #667eea;
            border: none;
            padding: 1rem 3rem;
            font-size: 1.2rem;
            font-weight: bold;
            border-radius: 50px;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            margin-bottom: 2rem;
          }

          .trigger-button:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(0,0,0,0.3);
          }

          .trigger-button:disabled {
            opacity: 0.7;
            cursor: not-allowed;
          }

          .trigger-button.loading {
            background: #f0f0f0;
          }

          .status-box {
            background: white;
            border-radius: 12px;
            padding: 2rem;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            width: 100%;
            max-width: 700px;
            margin-top: 1rem;
          }

          .loading-box {
            text-align: center;
          }

          .spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #667eea;
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

          .success-box h2 {
            color: #10b981;
            margin-top: 0;
          }

          .error-box {
            border-left: 4px solid #ef4444;
          }

          .error-box h2 {
            color: #ef4444;
            margin-top: 0;
          }

          .summary {
            display: flex;
            gap: 2rem;
            justify-content: center;
            margin: 2rem 0;
          }

          .summary-item {
            text-align: center;
            padding: 1.5rem;
            border-radius: 8px;
            min-width: 150px;
          }

          .summary-item.success {
            background: #d1fae5;
          }

          .summary-item.error {
            background: #fee2e2;
          }

          .summary-number {
            display: block;
            font-size: 3rem;
            font-weight: bold;
            color: #1f2937;
          }

          .summary-label {
            display: block;
            font-size: 0.9rem;
            color: #6b7280;
            margin-top: 0.5rem;
          }

          .details {
            margin-top: 2rem;
          }

          .details h3 {
            color: #1f2937;
            margin-bottom: 1rem;
          }

          .details ul {
            list-style: none;
            padding: 0;
          }

          .details li {
            padding: 0.75rem;
            background: #f9fafb;
            margin-bottom: 0.5rem;
            border-radius: 6px;
            border-left: 3px solid #667eea;
          }

          .failures li {
            border-left-color: #ef4444;
          }

          .error-message {
            color: #ef4444;
            font-size: 0.9rem;
            font-style: italic;
          }

          .note {
            margin-top: 1rem;
            padding: 1rem;
            background: #fef3c7;
            border-radius: 6px;
            font-size: 0.9rem;
            color: #92400e;
          }

          @media (max-width: 600px) {
            .title {
              font-size: 2rem;
            }

            .summary {
              flex-direction: column;
              gap: 1rem;
            }

            .summary-item {
              min-width: auto;
            }
          }
        `}</style>

        <style jsx global>{`
          html,
          body {
            padding: 0;
            margin: 0;
            font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto,
              Oxygen, Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue,
              sans-serif;
          }

          * {
            box-sizing: border-box;
          }
        `}</style>
      </div>
    </>
  );
}
