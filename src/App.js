import React, { useState, useRef } from 'react';

export default function TrashOrTreasure() {
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        setImagePreview(event.target.result);
      };
      reader.readAsDataURL(file);
      setResults(null);
      setError(null);
    }
  };

  const extractTitlesFromImage = async (imageBase64) => {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': window.apiKey,
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250929',
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: 'image/jpeg',
                    data: imageBase64,
                  },
                },
                {
                  type: 'text',
                  text: 'Extract ONLY the titles of CDs, records, books, or other media visible in this image. Return them as a simple JSON array of strings. Example: ["Title 1", "Title 2", "Title 3"]. If you cannot read a title clearly, skip it. Return ONLY the JSON array, no other text.',
                },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Claude API error: ${response.status} ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const content = data.content[0].text;
      
      const titles = JSON.parse(content);
      return titles.filter(title => title.length > 0);
    } catch (err) {
      console.error('Error extracting titles:', err);
      throw err;
    }
  };

  const searchDiscogs = async (title) => {
    try {
      const response = await fetch(
        `https://api.discogs.com/database/search?q=${encodeURIComponent(title)}&type=release&per_page=3`,
        {
          headers: {
            'User-Agent': 'TrashOrTreasure/1.0',
          },
        }
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        const release = data.results[0];
        const resourceUrl = release.resource_url;
        
        const detailResponse = await fetch(resourceUrl, {
          headers: {
            'User-Agent': 'TrashOrTreasure/1.0',
          },
        });

        if (!detailResponse.ok) {
          return null;
        }

        const detailData = await detailResponse.json();
        
        if (detailData.marketplace_stats) {
          const stats = detailData.marketplace_stats.last_sold;
          if (stats) {
            return {
              title: release.title,
              artist: release.basic_information?.artists?.[0]?.name || 'Unknown',
              avgPrice: stats.value || null,
              currency: stats.currency || 'USD',
              discogsUrl: release.uri,
            };
          }
        }

        return {
          title: release.title,
          artist: release.basic_information?.artists?.[0]?.name || 'Unknown',
          avgPrice: null,
          currency: 'USD',
          discogsUrl: release.uri,
        };
      }

      return null;
    } catch (err) {
      console.error('Error searching Discogs:', err);
      return null;
    }
  };

  const analyzeImage = async () => {
    if (!image) {
      setError('Please select an image first');
      return;
    }

    const apiKey = prompt('Enter your Anthropic API key:\n(Get one free at https://console.anthropic.com)');
    if (!apiKey) {
      return;
    }

    window.apiKey = apiKey;
    setLoading(true);
    setError(null);

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64Image = event.target.result.split(',')[1];

        try {
          const titles = await extractTitlesFromImage(base64Image);

          if (titles.length === 0) {
            setError('Could not detect any titles in the image. Try a clearer photo.');
            setLoading(false);
            return;
          }

          const searchPromises = titles.map((title) => searchDiscogs(title));
          const searchResults = await Promise.all(searchPromises);

          const validResults = searchResults
            .filter((result) => result !== null && result.avgPrice !== null)
            .sort((a, b) => (b.avgPrice || 0) - (a.avgPrice || 0));

          const allResults = searchResults.filter((result) => result !== null);

          setResults({
            extracted: titles,
            priced: validResults,
            unpriced: allResults.filter((r) => r.avgPrice === null),
          });
        } catch (err) {
          setError('Error analyzing image: ' + err.message);
        }

        setLoading(false);
      };

      reader.readAsDataURL(image);
    } catch (err) {
      setError('Error processing image: ' + err.message);
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>TRASH OR TREASURE</h1>
        <p style={styles.subtitle}>Spot the valuable items in your collection</p>
      </header>

      <div style={styles.uploadSection}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageSelect}
          style={{ display: 'none' }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          style={styles.uploadButton}
        >
          {imagePreview ? 'CHANGE IMAGE' : '+ UPLOAD PHOTO'}
        </button>

        {imagePreview && (
          <div style={styles.imagePreviewContainer}>
            <img src={imagePreview} alt="Preview" style={styles.imagePreview} />
          </div>
        )}
      </div>

      {imagePreview && !results && (
        <button
          onClick={analyzeImage}
          disabled={loading}
          style={{
            ...styles.analyzeButton,
            opacity: loading ? 0.6 : 1,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'ANALYZING...' : 'ANALYZE COLLECTION'}
        </button>
      )}

      {error && <div style={styles.error}>{error}</div>}

      {results && (
        <div style={styles.resultsSection}>
          <div style={styles.statsBar}>
            <div style={styles.stat}>
              <span style={styles.statLabel}>TITLES FOUND</span>
              <span style={styles.statValue}>{results.extracted.length}</span>
            </div>
            <div style={styles.stat}>
              <span style={styles.statLabel}>WITH PRICES</span>
              <span style={styles.statValue}>{results.priced.length}</span>
            </div>
            <div style={styles.stat}>
              <span style={styles.statLabel}>TOTAL VALUE</span>
              <span style={styles.statValue}>
                ${results.priced.reduce((sum, r) => sum + (r.avgPrice || 0), 0).toFixed(2)}
              </span>
            </div>
          </div>

          {results.priced.length > 0 && (
            <div style={styles.resultsContainer}>
              <h2 style={styles.resultsTitle}>RANKED BY VALUE</h2>
              {results.priced.map((item, idx) => (
                <div key={idx} style={styles.resultItem}>
                  <div style={styles.resultRank}>#{idx + 1}</div>
                  <div style={styles.resultContent}>
                    <h3 style={styles.resultTitle}>{item.title}</h3>
                    <p style={styles.resultArtist}>{item.artist}</p>
                  </div>
                  <div style={styles.resultPrice}>
                    <span style={styles.priceLabel}>AVG PRICE</span>
                    <span style={styles.priceValue}>
                      ${item.avgPrice?.toFixed(2) || 'N/A'}
                    </span>
                  </div>
                  
                    href={item.discogsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.discogsLink}
                  >
                    →
                  </a>
                </div>
              ))}
            </div>
          )}

          {results.unpriced.length > 0 && (
            <div style={styles.unpricedSection}>
              <h3 style={styles.unpricedTitle}>
                NO PRICE DATA ({results.unpriced.length})
              </h3>
              <div style={styles.unpricedGrid}>
                {results.unpriced.map((item, idx) => (
                  <div key={idx} style={styles.unpricedItem}>
                    <p style={styles.unpricedText}>{item.title}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => {
              setResults(null);
              setImagePreview(null);
              setImage(null);
            }}
            style={styles.resetButton}
          >
            ANALYZE ANOTHER PHOTO
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#0a0a0a',
    color: '#f0f0f0',
    fontFamily: '"Courier New", monospace',
    padding: '20px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  header: {
    textAlign: 'center',
    marginBottom: '40px',
    borderBottom: '2px solid #ff6b35',
    paddingBottom: '20px',
  },
  title: {
    fontSize: '48px',
    fontWeight: 'bold',
    margin: '0 0 10px 0',
    letterSpacing: '3px',
    color: '#ff6b35',
  },
  subtitle: {
    fontSize: '14px',
    color: '#999',
    margin: '0',
    textTransform: 'uppercase',
    letterSpacing: '2px',
  },
  uploadSection: {
    marginBottom: '30px',
  },
  uploadButton: {
    width: '100%',
    padding: '20px',
    backgroundColor: '#ff6b35',
    color: '#000',
    border: 'none',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    letterSpacing: '2px',
    transition: 'all 0.3s ease',
    textTransform: 'uppercase',
  },
  imagePreviewContainer: {
    marginTop: '20px',
    border: '1px solid #333',
    padding: '10px',
  },
  imagePreview: {
    maxWidth: '100%',
    maxHeight: '400px',
    display: 'block',
    margin: '0 auto',
  },
  analyzeButton: {
    width: '100%',
    padding: '16px',
    backgroundColor: '#00d9ff',
    color: '#000',
    border: 'none',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer',
    letterSpacing: '2px',
    textTransform: 'uppercase',
    marginBottom: '20px',
  },
  error: {
    backgroundColor: '#330000',
    border: '1px solid #ff4444',
    color: '#ff6666',
    padding: '15px',
    marginBottom: '20px',
    fontSize: '12px',
    fontFamily: '"Courier New", monospace',
  },
  resultsSection: {
    marginTop: '30px',
  },
  statsBar: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '20px',
    marginBottom: '40px',
    borderTop: '2px solid #333',
    borderBottom: '2px solid #333',
    paddingTop: '20px',
    paddingBottom: '20px',
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: '11px',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginBottom: '5px',
  },
  statValue: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#00d9ff',
  },
  resultsContainer: {
    marginBottom: '30px',
  },
  resultsTitle: {
    fontSize: '12px',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: '2px',
    margin: '0 0 20px 0',
    borderBottom: '1px solid #333',
    paddingBottom: '10px',
  },
  resultItem: {
    display: 'grid',
    gridTemplateColumns: '40px 1fr 150px 30px',
    gap: '20px',
    alignItems: 'center',
    padding: '15px 0',
    borderBottom: '1px solid #222',
    marginBottom: '10px',
  },
  resultRank: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#ff6b35',
  },
  resultContent: {
    minWidth: 0,
  },
  resultTitle: {
    margin: '0 0 5px 0',
    fontSize: '14px',
    fontWeight: 'bold',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  resultArtist: {
    margin: '0',
    fontSize: '12px',
    color: '#999',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  resultPrice: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  priceLabel: {
    fontSize: '10px',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginBottom: '3px',
  },
  priceValue: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#00d9ff',
  },
  discogsLink: {
    fontSize: '20px',
    color: '#ff6b35',
    textDecoration: 'none',
    cursor: 'pointer',
    transition: 'color 0.3s ease',
  },
  unpricedSection: {
    marginTop: '40px',
    paddingTop: '20px',
    borderTop: '1px solid #333',
  },
  unpricedTitle: {
    fontSize: '12px',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: '2px',
    margin: '0 0 15px 0',
  },
  unpricedGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '10px',
  },
  unpricedItem: {
    backgroundColor: '#111',
    border: '1px solid #333',
    padding: '10px',
  },
  unpricedText: {
    margin: '0',
    fontSize: '12px',
    color: '#999',
  },
  resetButton: {
    width: '100%',
    padding: '16px',
    backgroundColor: '#333',
    color: '#f0f0f0',
    border: '1px solid #666',
    fontSize: '12px',
    fontWeight: 'bold',
    cursor: 'pointer',
    letterSpacing: '2px',
    textTransform: 'uppercase',
    marginTop: '30px',
    transition: 'all 0.3s ease',
  },
};
