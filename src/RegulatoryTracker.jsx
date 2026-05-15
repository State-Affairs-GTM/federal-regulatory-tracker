import React, { useState, useEffect, useMemo } from 'react';
import { Search, Download, ExternalLink, Building2, FileText, Bookmark, BookmarkCheck, X, Loader2, AlertCircle, Filter, ChevronRight } from 'lucide-react';

const AGENCIES = [
  { slug: 'comptroller-of-the-currency', short: 'OCC', name: 'Office of the Comptroller of the Currency' },
  { slug: 'federal-reserve-system', short: 'FED', name: 'The Federal Reserve' },
  { slug: 'federal-deposit-insurance-corporation', short: 'FDIC', name: 'Federal Deposit Insurance Corporation' },
  { slug: 'consumer-financial-protection-bureau', short: 'CFPB', name: 'Consumer Financial Protection Bureau' },
  { slug: 'financial-crimes-enforcement-network', short: 'FinCEN', name: 'Financial Crimes Enforcement Network' },
  { slug: 'foreign-assets-control-office', short: 'OFAC', name: 'Office of Foreign Assets Control' },
  { slug: 'treasury-department', short: 'Treasury', name: 'US Treasury' },
];

const DOC_TYPES = [
  { value: 'RULE', label: 'Final Rule' },
  { value: 'PRORULE', label: 'Proposed Rule' },
  { value: 'NOTICE', label: 'Notice' },
  { value: 'PRESDOCU', label: 'Presidential Doc' },
];

const TYPE_STYLES = {
  RULE: { bg: '#e8f3ec', fg: '#1a6b3a', label: 'Final Rule' },
  PRORULE: { bg: '#fdf3dc', fg: '#7a5a1a', label: 'Proposed Rule' },
  NOTICE: { bg: '#e8f0f8', fg: '#1a4d7a', label: 'Notice' },
  PRESDOCU: { bg: '#f8e8e8', fg: '#7a1a1a', label: 'Presidential' },
};

const FIELDS = [
  'document_number', 'title', 'abstract', 'publication_date', 'agencies',
  'agency_names', 'type', 'pdf_url', 'html_url', 'raw_text_url', 'body_html_url',
  'docket_ids', 'regulation_id_numbers', 'comments_close_on', 'effective_on',
  'citation', 'significant', 'cfr_references', 'topics'
];

export default function RegulatoryTracker() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedAgencies, setSelectedAgencies] = useState(AGENCIES.map(a => a.slug));
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [dateRange, setDateRange] = useState('30');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [commentsOpenOnly, setCommentsOpenOnly] = useState(false);
  const [browseAll, setBrowseAll] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [tracked, setTracked] = useState(() => {
    try { return JSON.parse(window.localStorage?.getItem('sa_tracked') || '[]'); } catch { return []; }
  });
  const [view, setView] = useState('feed');
  const [showFilters, setShowFilters] = useState(false);

  // Debounce search input to avoid hammering the API
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    fetchDocs();
  }, [selectedAgencies, selectedTypes, dateRange, debouncedQuery, browseAll]);

  const fetchDocs = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.append('per_page', '100');
      params.append('order', 'newest');
      FIELDS.forEach(f => params.append('fields[]', f));

      const today = new Date();
      const gteDate = new Date(today);
      gteDate.setDate(gteDate.getDate() - parseInt(dateRange));
      params.append('conditions[publication_date][gte]', gteDate.toISOString().split('T')[0]);

      if (!browseAll && selectedAgencies.length > 0) {
        selectedAgencies.forEach(a => params.append('conditions[agencies][]', a));
      }
      if (selectedTypes.length > 0) {
        selectedTypes.forEach(t => params.append('conditions[type][]', t));
      }
      if (debouncedQuery.trim()) {
        params.append('conditions[term]', debouncedQuery.trim());
      }

      const url = `https://www.federalregister.gov/api/v1/documents.json?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const data = await res.json();
      setDocs(data.results || []);
    } catch (e) {
      setError(e.message);
      setDocs([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleTracked = (doc) => {
    const exists = tracked.find(t => t.document_number === doc.document_number);
    const next = exists
      ? tracked.filter(t => t.document_number !== doc.document_number)
      : [...tracked, doc];
    setTracked(next);
    try { window.localStorage?.setItem('sa_tracked', JSON.stringify(next)); } catch {}
  };

  const isTracked = (docNum) => tracked.some(t => t.document_number === docNum);

  const filtered = useMemo(() => {
    let result = view === 'tracked' ? tracked : docs;
    if (commentsOpenOnly) {
      const today = new Date().toISOString().split('T')[0];
      result = result.filter(d => d.comments_close_on && d.comments_close_on >= today);
    }
    return result;
  }, [docs, tracked, view, commentsOpenOnly]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return {
      total: docs.length,
      rules: docs.filter(d => d.type === 'RULE' || d.type === 'PRORULE').length,
      commentsOpen: docs.filter(d => d.comments_close_on && d.comments_close_on >= today).length,
      tracked: tracked.length,
    };
  }, [docs, tracked]);

  const toggleAgency = (slug) => {
    setSelectedAgencies(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]);
  };

  const toggleType = (val) => {
    setSelectedTypes(prev => prev.includes(val) ? prev.filter(t => t !== val) : [...prev, val]);
  };

  const formatDate = (s) => {
    if (!s) return null;
    return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const daysUntil = (s) => {
    if (!s) return null;
    const now = new Date();
    now.setHours(0,0,0,0);
    const then = new Date(s + 'T12:00:00');
    return Math.ceil((then - now) / (1000 * 60 * 60 * 24));
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#ffffff',
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      color: '#1a1a1a',
      fontSize: 14,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        .row { transition: background 0.1s ease; cursor: pointer; }
        .row:hover { background: #faf8f3 !important; }
        .chip { transition: all 0.1s ease; cursor: pointer; user-select: none; }
        .chip:hover { background: #f5f0e6 !important; }
        .btn { transition: all 0.12s ease; cursor: pointer; border: none; }
        .btn:hover { opacity: 0.85; }
        .btn:active { transform: translateY(1px); }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes slideIn { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: translateX(0); } }
        .detail-panel { animation: slideIn 0.2s ease-out; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .fade-in { animation: fadeIn 0.2s ease-out; }
        .scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
        .scrollbar::-webkit-scrollbar-track { background: transparent; }
        .scrollbar::-webkit-scrollbar-thumb { background: #e0d8c4; border-radius: 4px; }
        .scrollbar::-webkit-scrollbar-thumb:hover { background: #c8bea4; }
        input:focus, select:focus { outline: 2px solid #1a1a1a; outline-offset: -2px; }
      `}</style>

      {/* PAGE HEADER */}
      <div style={{ padding: '24px 32px 16px', borderBottom: '1px solid #ececec' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: '#1a1a1a', letterSpacing: '-0.01em' }}>
              Federal Regulatory Intelligence
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6a6a6a' }}>
              Track rules, proposed rules, and notices from federal financial regulators.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#faf8f3', padding: 3, borderRadius: 6, border: '1px solid #ececec' }}>
            <button
              onClick={() => setView('feed')}
              className="btn"
              style={{
                background: view === 'feed' ? '#ffffff' : 'transparent',
                color: view === 'feed' ? '#1a1a1a' : '#6a6a6a',
                padding: '6px 14px', fontSize: 13, fontWeight: 500, borderRadius: 4,
                boxShadow: view === 'feed' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
              }}
            >
              Live Feed
            </button>
            <button
              onClick={() => setView('tracked')}
              className="btn"
              style={{
                background: view === 'tracked' ? '#ffffff' : 'transparent',
                color: view === 'tracked' ? '#1a1a1a' : '#6a6a6a',
                padding: '6px 14px', fontSize: 13, fontWeight: 500, borderRadius: 4,
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: view === 'tracked' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
              }}
            >
              Tracked
              {tracked.length > 0 && (
                <span style={{ background: '#1a1a1a', color: '#ffffff', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 600 }}>{tracked.length}</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* STAT TILES */}
      <div style={{ padding: '20px 32px', borderBottom: '1px solid #ececec', background: '#fafafa' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <Stat label="Documents in window" value={stats.total} />
          <Stat label="Rules (proposed + final)" value={stats.rules} />
          <Stat label="Comments open" value={stats.commentsOpen} accent="#a16207" />
          <Stat label="Tracked by you" value={stats.tracked} accent="#1a4d7a" />
        </div>
      </div>

      {/* CONTROLS */}
      <div style={{ padding: '16px 32px', borderBottom: '1px solid #ececec', background: '#ffffff' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 280, maxWidth: 480 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9a9a9a' }} />
            <input
              type="text"
              placeholder="Search rules, dockets, citations…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%', padding: '8px 12px 8px 34px', fontSize: 13,
                background: '#ffffff', border: '1px solid #d9d9d9', borderRadius: 6,
                fontFamily: 'inherit', color: '#1a1a1a',
              }}
            />
          </div>
          <select
            value={dateRange}
            onChange={e => setDateRange(e.target.value)}
            style={{
              padding: '8px 12px', fontSize: 13, background: '#ffffff',
              border: '1px solid #d9d9d9', borderRadius: 6, fontFamily: 'inherit',
              color: '#1a1a1a', cursor: 'pointer',
            }}
          >
            <option value="1">Last 24 hours</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last year</option>
          </select>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="btn"
            style={{
              padding: '8px 14px', fontSize: 13, fontWeight: 500,
              background: showFilters ? '#1a1a1a' : '#ffffff', color: showFilters ? '#ffffff' : '#1a1a1a',
              border: '1px solid ' + (showFilters ? '#1a1a1a' : '#d9d9d9'), borderRadius: 6,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <Filter size={13} />
            Filters
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', userSelect: 'none', color: '#1a1a1a', marginLeft: 4 }}>
            <input
              type="checkbox"
              checked={commentsOpenOnly}
              onChange={e => setCommentsOpenOnly(e.target.checked)}
              style={{ accentColor: '#1a1a1a', width: 14, height: 14 }}
            />
            Comments open only
          </label>
        </div>

        {/* Agency chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: '#9a9a9a', fontWeight: 500, marginRight: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Agencies
          </span>
          {AGENCIES.map(a => {
            const active = !browseAll && selectedAgencies.includes(a.slug);
            return (
              <span
                key={a.slug}
                onClick={() => { if (browseAll) setBrowseAll(false); toggleAgency(a.slug); }}
                className="chip"
                style={{
                  padding: '5px 11px', borderRadius: 14, fontSize: 12, fontWeight: 500,
                  background: active ? '#1a1a1a' : '#ffffff',
                  color: active ? '#ffffff' : '#4a4a4a',
                  border: `1px solid ${active ? '#1a1a1a' : '#d9d9d9'}`,
                  opacity: browseAll ? 0.4 : 1,
                }}
              >
                {a.short}
              </span>
            );
          })}
          <div style={{ width: 1, height: 16, background: '#d9d9d9', margin: '0 4px' }} />
          <span
            onClick={() => setBrowseAll(!browseAll)}
            className="chip"
            style={{
              padding: '5px 11px', borderRadius: 14, fontSize: 12, fontWeight: 500,
              background: browseAll ? '#f5f0e6' : '#ffffff',
              color: browseAll ? '#1a1a1a' : '#4a4a4a',
              border: `1px solid ${browseAll ? '#1a1a1a' : '#d9d9d9'}`,
            }}
          >
            {browseAll ? '✓ ' : ''}Browse all Federal Register
          </span>
        </div>

        {/* Type filters, collapsible */}
        {showFilters && (
          <div className="fade-in" style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: '#9a9a9a', fontWeight: 500, marginRight: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Document type
            </span>
            {DOC_TYPES.map(t => {
              const active = selectedTypes.includes(t.value);
              return (
                <span
                  key={t.value}
                  onClick={() => toggleType(t.value)}
                  className="chip"
                  style={{
                    padding: '5px 11px', borderRadius: 14, fontSize: 12, fontWeight: 500,
                    background: active ? '#1a1a1a' : '#ffffff',
                    color: active ? '#ffffff' : '#4a4a4a',
                    border: `1px solid ${active ? '#1a1a1a' : '#d9d9d9'}`,
                  }}
                >
                  {t.label}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* MAIN */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedDoc ? 'minmax(0, 1fr) 460px' : '1fr', alignItems: 'flex-start' }}>
        {/* LEFT: feed */}
        <section style={{ padding: '20px 32px 32px' }}>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, color: '#9a9a9a' }}>
              <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ marginLeft: 10, fontSize: 13 }}>Loading from Federal Register…</span>
            </div>
          )}

          {error && (
            <div style={{ padding: 16, background: '#fef3f2', border: '1px solid #f5c6c0', borderRadius: 6, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <AlertCircle size={18} color="#a13a2a" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}>Connection error</div>
                <div style={{ fontSize: 12, color: '#6a6a6a', marginTop: 2 }}>{error}</div>
                <button onClick={fetchDocs} className="btn" style={{ marginTop: 8, background: '#1a1a1a', color: '#ffffff', padding: '5px 12px', fontSize: 12, fontWeight: 500, borderRadius: 4 }}>Retry</button>
              </div>
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div style={{ padding: 60, textAlign: 'center', color: '#9a9a9a' }}>
              <FileText size={28} style={{ opacity: 0.4, marginBottom: 10 }} />
              <div style={{ fontSize: 14, fontWeight: 500, color: '#4a4a4a' }}>
                {view === 'tracked' ? 'No tracked documents yet' : 'No documents match your filters'}
              </div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                {view === 'tracked' ? 'Bookmark a rule from the feed to start tracking.' : 'Try widening your date range or agency selection.'}
              </div>
            </div>
          )}

          {!loading && !error && filtered.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#6a6a6a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {view === 'tracked' ? 'Your tracked' : (browseAll ? 'All Federal Register' : 'Financial regulators')}
                  <span style={{ color: '#9a9a9a', fontWeight: 500, marginLeft: 8 }}>
                    · {filtered.length} {filtered.length === 1 ? 'document' : 'documents'}
                  </span>
                </h2>
                <span style={{ fontSize: 11, color: '#9a9a9a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Newest first
                </span>
              </div>

              <div style={{ border: '1px solid #ececec', borderRadius: 6, overflow: 'hidden', background: '#ffffff' }}>
                {filtered.map((doc, idx) => {
                  const typeStyle = TYPE_STYLES[doc.type] || { bg: '#f0f0f0', fg: '#4a4a4a', label: doc.type };
                  const days = daysUntil(doc.comments_close_on);
                  return (
                    <article
                      key={doc.document_number}
                      onClick={() => setSelectedDoc(doc)}
                      className="row"
                      style={{
                        padding: '14px 16px',
                        borderBottom: idx < filtered.length - 1 ? '1px solid #ececec' : 'none',
                        background: selectedDoc?.document_number === doc.document_number ? '#faf8f3' : '#ffffff',
                        display: 'flex', gap: 14, alignItems: 'flex-start',
                      }}
                    >
                      {/* date column */}
                      <div style={{ flexShrink: 0, width: 48, textAlign: 'center', paddingTop: 2 }}>
                        <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1, color: '#1a1a1a' }}>
                          {new Date(doc.publication_date + 'T12:00:00').getDate()}
                        </div>
                        <div style={{ fontSize: 10, color: '#9a9a9a', marginTop: 3, textTransform: 'uppercase', fontWeight: 500, letterSpacing: '0.04em' }}>
                          {new Date(doc.publication_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' })}
                        </div>
                      </div>

                      {/* content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: 10, fontWeight: 600,
                            background: typeStyle.bg, color: typeStyle.fg,
                            padding: '2px 7px', borderRadius: 3, textTransform: 'uppercase', letterSpacing: '0.03em',
                          }}>
                            {typeStyle.label}
                          </span>
                          {doc.significant && (
                            <span style={{ fontSize: 10, color: '#a13a2a', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                              ◆ Significant
                            </span>
                          )}
                          {doc.regulation_id_numbers?.[0] && (
                            <span style={{ fontSize: 11, color: '#9a9a9a' }}>
                              RIN {doc.regulation_id_numbers[0]}
                            </span>
                          )}
                          {days !== null && days >= 0 && days <= 30 && (
                            <span style={{
                              fontSize: 10, fontWeight: 600,
                              color: days <= 7 ? '#a13a2a' : '#a16207',
                              background: days <= 7 ? '#fef3f2' : '#fdf3dc',
                              padding: '2px 7px', borderRadius: 3, marginLeft: 'auto', textTransform: 'uppercase', letterSpacing: '0.03em',
                            }}>
                              Comments close in {days}d
                            </span>
                          )}
                        </div>

                        <h3 style={{
                          margin: 0, fontSize: 14, fontWeight: 600, lineHeight: 1.4, color: '#1a1a1a',
                        }}>
                          {doc.title}
                        </h3>

                        {doc.abstract && (
                          <p style={{
                            margin: '4px 0 0', fontSize: 12, lineHeight: 1.5, color: '#6a6a6a',
                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                          }}>
                            {doc.abstract}
                          </p>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                          {doc.agency_names && (
                            <span style={{ fontSize: 11, color: '#6a6a6a', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Building2 size={11} color="#9a9a9a" />
                              {doc.agency_names.slice(0, 2).join(' · ')}
                              {doc.agency_names.length > 2 && ` +${doc.agency_names.length - 2}`}
                            </span>
                          )}
                          {doc.citation && (
                            <span style={{ fontSize: 11, color: '#9a9a9a' }}>
                              {doc.citation}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* actions */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleTracked(doc); }}
                          className="btn"
                          style={{
                            background: isTracked(doc.document_number) ? '#1a1a1a' : '#ffffff',
                            color: isTracked(doc.document_number) ? '#ffffff' : '#9a9a9a',
                            border: `1px solid ${isTracked(doc.document_number) ? '#1a1a1a' : '#d9d9d9'}`,
                            padding: 5, borderRadius: 4, display: 'flex',
                          }}
                          title={isTracked(doc.document_number) ? 'Untrack' : 'Track'}
                        >
                          {isTracked(doc.document_number) ? <BookmarkCheck size={13} /> : <Bookmark size={13} />}
                        </button>
                        <ChevronRight size={14} color="#c8c8c8" />
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* RIGHT: detail panel */}
        {selectedDoc && (
          <aside className="detail-panel" style={{
            position: 'sticky', top: 0, maxHeight: '100vh',
            background: '#ffffff', borderLeft: '1px solid #ececec',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ padding: '20px 24px 14px', borderBottom: '1px solid #ececec', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                  {(() => {
                    const ts = TYPE_STYLES[selectedDoc.type] || { bg: '#f0f0f0', fg: '#4a4a4a', label: selectedDoc.type };
                    return (
                      <span style={{
                        fontSize: 10, fontWeight: 600,
                        background: ts.bg, color: ts.fg, padding: '2px 7px', borderRadius: 3, textTransform: 'uppercase', letterSpacing: '0.03em',
                      }}>{ts.label}</span>
                    );
                  })()}
                  {selectedDoc.significant && (
                    <span style={{ fontSize: 10, color: '#a13a2a', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', alignSelf: 'center' }}>
                      ◆ Significant
                    </span>
                  )}
                </div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, lineHeight: 1.35, color: '#1a1a1a' }}>
                  {selectedDoc.title}
                </h2>
              </div>
              <button
                onClick={() => setSelectedDoc(null)}
                className="btn"
                style={{ background: 'transparent', padding: 4, color: '#9a9a9a', border: 'none', flexShrink: 0 }}
                title="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="scrollbar" style={{ overflowY: 'auto', flex: 1, padding: '16px 24px' }}>
              {/* Action buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, marginBottom: 20 }}>
                {selectedDoc.pdf_url && (
                  <a href={selectedDoc.pdf_url} target="_blank" rel="noopener noreferrer" className="btn" style={{
                    background: '#1a1a1a', color: '#ffffff', padding: '8px 12px', fontSize: 12, fontWeight: 500,
                    textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 5,
                  }}>
                    <Download size={13} /> PDF
                  </a>
                )}
                {selectedDoc.html_url && (
                  <a href={selectedDoc.html_url} target="_blank" rel="noopener noreferrer" className="btn" style={{
                    background: '#ffffff', color: '#1a1a1a', padding: '8px 12px', fontSize: 12, fontWeight: 500,
                    textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    border: '1px solid #d9d9d9', borderRadius: 5,
                  }}>
                    <ExternalLink size={13} /> View on FR
                  </a>
                )}
                {selectedDoc.raw_text_url && (
                  <a href={selectedDoc.raw_text_url} target="_blank" rel="noopener noreferrer" className="btn" style={{
                    background: '#ffffff', color: '#1a1a1a', padding: '8px 12px', fontSize: 12, fontWeight: 500,
                    textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    border: '1px solid #d9d9d9', borderRadius: 5,
                  }}>
                    <FileText size={13} /> Plain text
                  </a>
                )}
                <button
                  onClick={() => toggleTracked(selectedDoc)}
                  className="btn"
                  style={{
                    background: isTracked(selectedDoc.document_number) ? '#f5f0e6' : '#ffffff',
                    color: '#1a1a1a',
                    padding: '8px 12px', fontSize: 12, fontWeight: 500,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    border: `1px solid ${isTracked(selectedDoc.document_number) ? '#1a1a1a' : '#d9d9d9'}`, borderRadius: 5,
                  }}
                >
                  {isTracked(selectedDoc.document_number) ? <><BookmarkCheck size={13} /> Tracked</> : <><Bookmark size={13} /> Track</>}
                </button>
              </div>

              <DetailSection title="Key dates">
                <DetailRow label="Published" value={formatDate(selectedDoc.publication_date)} />
                {selectedDoc.comments_close_on && (
                  <DetailRow
                    label="Comments close"
                    value={formatDate(selectedDoc.comments_close_on)}
                    badge={(() => {
                      const d = daysUntil(selectedDoc.comments_close_on);
                      if (d === null) return null;
                      if (d < 0) return { text: 'Closed', color: '#6a6a6a', bg: '#f0f0f0' };
                      if (d === 0) return { text: 'Today', color: '#a13a2a', bg: '#fef3f2' };
                      return { text: `${d}d left`, color: d <= 7 ? '#a13a2a' : '#a16207', bg: d <= 7 ? '#fef3f2' : '#fdf3dc' };
                    })()}
                  />
                )}
                {selectedDoc.effective_on && <DetailRow label="Effective on" value={formatDate(selectedDoc.effective_on)} />}
              </DetailSection>

              <DetailSection title="Identifiers">
                <DetailRow label="Document #" value={selectedDoc.document_number} />
                {selectedDoc.citation && <DetailRow label="Citation" value={selectedDoc.citation} />}
                {selectedDoc.regulation_id_numbers?.length > 0 && (
                  <DetailRow label="RIN" value={selectedDoc.regulation_id_numbers.join(', ')} />
                )}
                {selectedDoc.docket_ids?.length > 0 && (
                  <DetailRow label="Docket" value={selectedDoc.docket_ids.join(', ')} />
                )}
              </DetailSection>

              {selectedDoc.agency_names?.length > 0 && (
                <DetailSection title="Agencies">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {selectedDoc.agency_names.map((n, i) => (
                      <div key={i} style={{ fontSize: 12, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Building2 size={11} color="#9a9a9a" />
                        {n}
                      </div>
                    ))}
                  </div>
                </DetailSection>
              )}

              {selectedDoc.cfr_references?.length > 0 && (
                <DetailSection title="CFR references">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {selectedDoc.cfr_references.map((c, i) => (
                      <span key={i} style={{
                        fontSize: 11, background: '#faf8f3', padding: '3px 8px', borderRadius: 3, color: '#1a1a1a', fontWeight: 500,
                      }}>
                        {c.title} CFR {c.part}{c.chapter ? ` ch.${c.chapter}` : ''}
                      </span>
                    ))}
                  </div>
                </DetailSection>
              )}

              {selectedDoc.topics?.length > 0 && (
                <DetailSection title="Topics">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {selectedDoc.topics.slice(0, 12).map((t, i) => (
                      <span key={i} style={{
                        fontSize: 11, background: '#ffffff', padding: '3px 8px', borderRadius: 3,
                        border: '1px solid #ececec', color: '#4a4a4a',
                      }}>
                        {t}
                      </span>
                    ))}
                  </div>
                </DetailSection>
              )}

              {selectedDoc.abstract && (
                <DetailSection title="Abstract">
                  <p style={{ fontSize: 12, lineHeight: 1.55, color: '#1a1a1a', margin: 0 }}>
                    {selectedDoc.abstract}
                  </p>
                </DetailSection>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div style={{ background: '#ffffff', padding: '12px 16px', borderRadius: 6, border: '1px solid #ececec' }}>
      <div style={{ fontSize: 24, fontWeight: 600, color: accent || '#1a1a1a', lineHeight: 1.1, letterSpacing: '-0.01em' }}>
        {value.toLocaleString()}
      </div>
      <div style={{ fontSize: 11, color: '#9a9a9a', textTransform: 'uppercase', fontWeight: 500, letterSpacing: '0.04em', marginTop: 4 }}>
        {label}
      </div>
    </div>
  );
}

function DetailSection({ title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        fontSize: 11, color: '#9a9a9a', textTransform: 'uppercase', fontWeight: 500, letterSpacing: '0.04em',
        marginBottom: 8, paddingBottom: 5, borderBottom: '1px solid #ececec',
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function DetailRow({ label, value, badge }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', gap: 10 }}>
      <span style={{ fontSize: 12, color: '#6a6a6a', flexShrink: 0 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, textAlign: 'right' }}>
        <span style={{ fontSize: 12, color: '#1a1a1a', fontWeight: 500 }}>
          {value}
        </span>
        {badge && (
          <span style={{
            fontSize: 10, fontWeight: 600, color: badge.color, background: badge.bg,
            padding: '2px 6px', borderRadius: 3, textTransform: 'uppercase', letterSpacing: '0.03em',
          }}>
            {badge.text}
          </span>
        )}
      </div>
    </div>
  );
}
