import React, { useState, useEffect, useMemo } from 'react';
import { Search, Download, ExternalLink, Building2, FileText, Pin, PinOff, X, Loader2, AlertCircle, Filter, ChevronRight, ChevronDown, RefreshCw, Plus, Check, MoreVertical } from 'lucide-react';

const AGENCIES = [
  { slug: 'comptroller-of-the-currency', short: 'OCC', name: 'Office of the Comptroller of the Currency' },
  { slug: 'federal-reserve-system', short: 'FED', name: 'The Federal Reserve' },
  { slug: 'federal-deposit-insurance-corporation', short: 'FDIC', name: 'Federal Deposit Insurance Corporation' },
  { slug: 'consumer-financial-protection-bureau', short: 'CFPB', name: 'Consumer Financial Protection Bureau' },
  { slug: 'financial-crimes-enforcement-network', short: 'FinCEN', name: 'Financial Crimes Enforcement Network' },
  { slug: 'foreign-assets-control-office', short: 'OFAC', name: 'Office of Foreign Assets Control' },
  { slug: 'treasury-department', short: 'Treasury', name: 'US Treasury' },
];

// API quirk: `conditions[type][]` accepts short codes (RULE / PRORULE / NOTICE / PRESDOCU)
// but the `type` field on each returned document is the human string ("Rule", "Proposed Rule", …).
// So we key everything user-facing off the response value and keep the code only for the query.
const DOC_TYPES = [
  { code: 'RULE', apiType: 'Rule', label: 'Final Rule' },
  { code: 'PRORULE', apiType: 'Proposed Rule', label: 'Proposed Rule' },
  { code: 'NOTICE', apiType: 'Notice', label: 'Notice' },
  { code: 'PRESDOCU', apiType: 'Presidential Document', label: 'Presidential Doc' },
];

const TYPE_STYLES = {
  'Rule': { bg: '#e8f3ec', fg: '#1a6b3a', label: 'Final Rule' },
  'Proposed Rule': { bg: '#fdf3dc', fg: '#7a5a1a', label: 'Proposed Rule' },
  'Notice': { bg: '#e8f0f8', fg: '#1a4d7a', label: 'Notice' },
  'Presidential Document': { bg: '#f8e8e8', fg: '#7a1a1a', label: 'Presidential' },
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
  const [pinned, setPinned] = useState(() => {
    try { return JSON.parse(window.localStorage?.getItem('sa_reg_pinned') || '[]'); } catch { return []; }
  });
  const [showFilters, setShowFilters] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [, setTick] = useState(0);
  const [requestOpen, setRequestOpen] = useState(false);
  const [pinnedExpanded, setPinnedExpanded] = useState(true);
  const [menuOpenFor, setMenuOpenFor] = useState(null); // document_number whose kebab menu is open
  // Track viewport width so we can flip the detail panel between side-by-side and overlay-drawer
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const sideBySide = !!selectedDoc && vw >= 900;
  const overlayDetail = !!selectedDoc && vw < 900;

  // Force re-render every 30s so the "X min ago" label stays current
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

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
    // On refresh (when we already have content), keep the spinner visible at least 350ms
    // so users see feedback. On initial load, return as fast as possible.
    const minDelay = docs.length > 0 ? new Promise(r => setTimeout(r, 350)) : Promise.resolve();
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
      setLastUpdated(Date.now());
    } catch (e) {
      setError(e.message);
      setDocs([]);
    } finally {
      await minDelay;
      setLoading(false);
    }
  };

  const togglePin = (doc) => {
    const exists = pinned.find(t => t.document_number === doc.document_number);
    const next = exists
      ? pinned.filter(t => t.document_number !== doc.document_number)
      : [...pinned, doc];
    setPinned(next);
    try { window.localStorage?.setItem('sa_reg_pinned', JSON.stringify(next)); } catch {}
  };

  const isPinned = (docNum) => pinned.some(t => t.document_number === docNum);

  const filtered = useMemo(() => {
    let result = docs;
    if (commentsOpenOnly) {
      const today = new Date().toISOString().split('T')[0];
      result = result.filter(d => d.comments_close_on && d.comments_close_on >= today);
    }
    return result;
  }, [docs, commentsOpenOnly]);

  // Split the visible feed into pinned-first / everything-else, like SA Pro's 360 nav rail.
  // Use the pinned localStorage list as the source of truth for what's pinned, but render the
  // feed object (which has fresh fields) when possible. Otherwise fall back to the stored copy.
  const { pinnedRows, unpinnedRows } = useMemo(() => {
    const fedByNum = new Map(filtered.map(d => [d.document_number, d]));
    const pinnedRows = pinned
      .map(p => fedByNum.get(p.document_number) || p)
      // honor comments-open filter on pinned rows too
      .filter(d => {
        if (!commentsOpenOnly) return true;
        const today = new Date().toISOString().split('T')[0];
        return d.comments_close_on && d.comments_close_on >= today;
      });
    const pinnedNums = new Set(pinnedRows.map(d => d.document_number));
    const unpinnedRows = filtered.filter(d => !pinnedNums.has(d.document_number));
    return { pinnedRows, unpinnedRows };
  }, [filtered, pinned, commentsOpenOnly]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return {
      total: docs.length,
      rules: docs.filter(d => d.type === 'Rule' || d.type === 'Proposed Rule').length,
      commentsOpen: docs.filter(d => d.comments_close_on && d.comments_close_on >= today).length,
      pinned: pinned.length,
    };
  }, [docs, pinned]);

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

  const relativeTime = (ts) => {
    if (!ts) return null;
    const secs = Math.floor((Date.now() - ts) / 1000);
    if (secs < 30) return 'just now';
    if (secs < 90) return '1 min ago';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    return new Date(ts).toLocaleDateString();
  };

  const daysUntil = (s) => {
    if (!s) return null;
    const now = new Date();
    now.setHours(0,0,0,0);
    const then = new Date(s + 'T12:00:00');
    return Math.ceil((then - now) / (1000 * 60 * 60 * 24));
  };

  // Render a single feed row. `isLast` and `total` are used for the bottom-border treatment.
  // `inPinnedSection` flips on the pin-icon prefix in the title row.
  const renderDocRow = (doc, idx, total, inPinnedSection) => {
    const typeStyle = TYPE_STYLES[doc.type] || { bg: '#f0f0f0', fg: 'var(--sa-text-default)', label: doc.type };
    const days = daysUntil(doc.comments_close_on);
    const pinnedNow = isPinned(doc.document_number);
    const menuOpen = menuOpenFor === doc.document_number;
    return (
      <article
        key={doc.document_number}
        onClick={() => setSelectedDoc(doc)}
        className="row"
        style={{
          padding: '14px 16px',
          borderBottom: idx < total - 1 ? '1px solid var(--sa-border)' : 'none',
          background: selectedDoc?.document_number === doc.document_number ? 'var(--sa-bg-elevated)' : 'var(--sa-bg-card)',
          display: 'flex', gap: 14, alignItems: 'flex-start', position: 'relative',
        }}
      >
        {/* date column */}
        <div style={{ flexShrink: 0, width: 48, textAlign: 'center', paddingTop: 2 }}>
          <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1, color: 'var(--sa-text-default)' }}>
            {new Date(doc.publication_date + 'T12:00:00').getDate()}
          </div>
          <div style={{ fontSize: 10, color: 'var(--sa-text-muted)', marginTop: 3, textTransform: 'uppercase', fontWeight: 500, letterSpacing: '0.04em' }}>
            {new Date(doc.publication_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' })}
          </div>
        </div>

        {/* content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 10, fontWeight: 600,
              background: typeStyle.bg, color: typeStyle.fg,
              padding: '3px 9px', borderRadius: 'var(--sa-radius-pill)', textTransform: 'uppercase', letterSpacing: '0.04em',
            }}>
              {typeStyle.label}
            </span>
            {doc.significant && (
              <span style={{
                fontSize: 10, fontWeight: 600,
                color: '#a13a2a', background: '#fef3f2',
                padding: '3px 9px', borderRadius: 'var(--sa-radius-pill)', textTransform: 'uppercase', letterSpacing: '0.04em',
              }}>
                ◆ Significant
              </span>
            )}
            {doc.regulation_id_numbers?.[0] && (
              <span style={{ fontSize: 11, color: 'var(--sa-text-muted)' }}>
                RIN {doc.regulation_id_numbers[0]}
              </span>
            )}
            {days !== null && days >= 0 && days <= 30 && (
              <span style={{
                fontSize: 10, fontWeight: 600,
                color: days <= 7 ? '#a13a2a' : '#a16207',
                background: days <= 7 ? '#fef3f2' : '#fdf3dc',
                padding: '3px 9px', borderRadius: 'var(--sa-radius-pill)', marginLeft: 'auto', textTransform: 'uppercase', letterSpacing: '0.04em',
              }}>
                Comments close in {days}d
              </span>
            )}
          </div>

          <h3 style={{
            margin: 0, fontSize: 14, fontWeight: 600, lineHeight: 1.4, color: 'var(--sa-text-default)',
            display: 'flex', alignItems: 'flex-start', gap: 6,
          }}>
            {inPinnedSection && (
              <Pin size={12} style={{ flexShrink: 0, marginTop: 3, fill: 'currentColor', color: 'var(--sa-text-secondary)', transform: 'rotate(-15deg)' }} />
            )}
            <span>{doc.title}</span>
          </h3>

          {doc.abstract && (
            <p style={{
              margin: '4px 0 0', fontSize: 12, lineHeight: 1.5, color: 'var(--sa-text-secondary)',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {doc.abstract}
            </p>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
            {doc.agency_names && (
              <span style={{ fontSize: 11, color: 'var(--sa-text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Building2 size={11} color="#9a9a9a" />
                {doc.agency_names.slice(0, 2).join(' · ')}
                {doc.agency_names.length > 2 && ` +${doc.agency_names.length - 2}`}
              </span>
            )}
            {doc.citation && (
              <span style={{ fontSize: 11, color: 'var(--sa-text-muted)' }}>
                {doc.citation}
              </span>
            )}
          </div>
        </div>

        {/* actions: kebab menu */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0, position: 'relative' }}>
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpenFor(menuOpen ? null : doc.document_number); }}
            className="btn"
            style={{
              background: menuOpen ? 'var(--sa-bg-elevated)' : 'transparent',
              color: 'var(--sa-text-muted)',
              border: 'none', padding: 4, borderRadius: 4, display: 'flex',
            }}
            title="More actions"
          >
            <MoreVertical size={16} />
          </button>
          <ChevronRight size={14} color="var(--sa-text-muted)" />

          {menuOpen && (
            <>
              {/* click-outside catcher */}
              <div
                onClick={(e) => { e.stopPropagation(); setMenuOpenFor(null); }}
                style={{ position: 'fixed', inset: 0, zIndex: 40 }}
              />
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute', top: 30, right: 0, zIndex: 50,
                  minWidth: 160, background: 'var(--sa-bg-card)',
                  border: '1px solid var(--sa-border)', borderRadius: 6,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
                  padding: 4,
                }}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); togglePin(doc); setMenuOpenFor(null); }}
                  className="btn"
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 10px', background: 'transparent', color: 'var(--sa-text-default)',
                    fontSize: 13, fontWeight: 400, borderRadius: 4, textAlign: 'left',
                  }}
                >
                  {pinnedNow ? <PinOff size={14} style={{ transform: 'rotate(-15deg)' }} /> : <Pin size={14} style={{ transform: 'rotate(-15deg)' }} />}
                  {pinnedNow ? 'Unpin' : 'Pin to top'}
                </button>
              </div>
            </>
          )}
        </div>
      </article>
    );
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--sa-bg-page)',
      fontFamily: 'var(--sa-font-sans)',
      color: 'var(--sa-text-default)',
      fontSize: 14,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Newsreader:wght@400;500;600&display=swap');
        :root {
          --sa-font-sans: "IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          --sa-font-serif: "Newsreader", Georgia, serif;
          --sa-bg-page: rgb(250, 248, 245);
          --sa-bg-card: rgb(252, 252, 252);
          --sa-bg-elevated: rgb(245, 240, 230);
          --sa-bg-hover: rgb(245, 240, 230);
          --sa-text-default: rgb(25, 22, 16);
          --sa-text-secondary: hsl(0, 0%, 45%);
          --sa-text-muted: hsl(0, 0%, 60%);
          --sa-text-link: hsl(221, 83%, 53%);
          --sa-border: rgb(212, 201, 175);
          --sa-border-strong: rgb(180, 165, 130);
          --sa-chip-selected-bg: hsl(213, 97%, 87%);
          --sa-chip-selected-border: hsl(213, 94%, 68%);
          --sa-chip-selected-fg: hsl(221, 83%, 28%);
          --sa-accent-blue: hsl(221, 83%, 53%);
          --sa-accent-blue-hover: hsl(221, 83%, 45%);
          --sa-radius-sm: 4px;
          --sa-radius-md: 6px;
          --sa-radius-lg: 8px;
          --sa-radius-pill: 9999px;
        }
        * { box-sizing: border-box; }
        body { margin: 0; background: var(--sa-bg-page); }
        .row { transition: background 0.1s ease; cursor: pointer; }
        .row:hover { background: var(--sa-bg-hover) !important; }
        .chip { transition: all 0.1s ease; cursor: pointer; user-select: none; }
        .chip:hover { background: var(--sa-bg-elevated) !important; }
        .chip-selected:hover { background: hsl(213, 97%, 82%) !important; }
        .btn { transition: all 0.12s ease; cursor: pointer; border: none; }
        .btn:hover { opacity: 0.88; }
        .btn:active { transform: translateY(1px); }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes slideIn { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: translateX(0); } }
        .detail-panel { animation: slideIn 0.2s ease-out; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .fade-in { animation: fadeIn 0.2s ease-out; }
        .scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
        .scrollbar::-webkit-scrollbar-track { background: transparent; }
        .scrollbar::-webkit-scrollbar-thumb { background: var(--sa-border); border-radius: 4px; }
        .scrollbar::-webkit-scrollbar-thumb:hover { background: var(--sa-border-strong); }
        input:focus, select:focus { outline: 2px solid var(--sa-text-default); outline-offset: -2px; }
      `}</style>

      {/* PAGE HEADER */}
      <div style={{ padding: '24px clamp(16px, 3vw, 32px) 16px', borderBottom: '1px solid var(--sa-border)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 500, color: 'var(--sa-text-default)', letterSpacing: '-0.005em', lineHeight: 1.4 }}>
              Federal Regulatory Intelligence
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--sa-text-secondary)' }}>
              Rules, proposed rules, and notices from federal financial regulators.
            </p>
          </div>
        </div>
      </div>

      {/* STAT TILES */}
      <div style={{ padding: '20px clamp(16px, 3vw, 32px)', borderBottom: '1px solid var(--sa-border)', background: 'var(--sa-bg-page)' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginBottom: 10, fontSize: 11, color: 'var(--sa-text-secondary)' }}>
          {lastUpdated && <span>Last updated {relativeTime(lastUpdated)}</span>}
          <button
            onClick={fetchDocs}
            className="btn"
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px',
              background: 'transparent', color: 'var(--sa-text-link)', fontSize: 11, fontWeight: 500,
              cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.5 : 1,
            }}
          >
            <RefreshCw size={11} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} />
            Refresh now
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          <Stat label="Documents in window" value={stats.total} />
          <Stat label="Rules (proposed + final)" value={stats.rules} />
          <Stat label="Comments open" value={stats.commentsOpen} accent="#a16207" />
          <Stat label="Pinned by you" value={stats.pinned} accent="#1a4d7a" />
        </div>
      </div>

      {/* CONTROLS */}
      <div style={{ padding: '16px clamp(16px, 3vw, 32px)', borderBottom: '1px solid var(--sa-border)', background: 'var(--sa-bg-card)' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 280, maxWidth: 480 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--sa-text-muted)' }} />
            <input
              type="text"
              placeholder="Search rules, dockets, citations…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%', padding: '8px 12px 8px 34px', fontSize: 13,
                background: 'var(--sa-bg-card)', border: '1px solid var(--sa-border)', borderRadius: 6,
                fontFamily: 'inherit', color: 'var(--sa-text-default)',
              }}
            />
          </div>
          <select
            value={dateRange}
            onChange={e => setDateRange(e.target.value)}
            style={{
              padding: '8px 12px', fontSize: 13, background: 'var(--sa-bg-card)',
              border: '1px solid var(--sa-border)', borderRadius: 6, fontFamily: 'inherit',
              color: 'var(--sa-text-default)', cursor: 'pointer',
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
              background: showFilters ? 'var(--sa-chip-selected-bg)' : 'var(--sa-bg-card)', color: showFilters ? 'var(--sa-chip-selected-fg)' : 'var(--sa-text-default)',
              border: '1px solid ' + (showFilters ? 'var(--sa-chip-selected-border)' : 'var(--sa-border)'), borderRadius: 6,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <Filter size={13} />
            Filters
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', userSelect: 'none', color: 'var(--sa-text-default)', marginLeft: 4 }}>
            <input
              type="checkbox"
              checked={commentsOpenOnly}
              onChange={e => setCommentsOpenOnly(e.target.checked)}
              style={{ accentColor: 'var(--sa-text-default)', width: 14, height: 14 }}
            />
            Comments open only
          </label>
        </div>

        {/* Agency chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--sa-text-muted)', fontWeight: 500, marginRight: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Agencies
          </span>
          {!browseAll && (
            selectedAgencies.length === 0 ? (
              <button
                className="btn"
                onClick={() => setSelectedAgencies(AGENCIES.map(a => a.slug))}
                style={{
                  fontSize: 11, fontWeight: 500, background: 'transparent', padding: '2px 4px', marginRight: 4,
                  color: 'var(--sa-text-link)', cursor: 'pointer',
                }}
              >
                Select all
              </button>
            ) : (
              <button
                className="btn"
                onClick={() => setSelectedAgencies([])}
                style={{
                  fontSize: 11, fontWeight: 500, background: 'transparent', padding: '2px 4px', marginRight: 4,
                  color: 'var(--sa-text-link)', cursor: 'pointer',
                }}
              >
                Clear
              </button>
            )
          )}
          {AGENCIES.map(a => {
            const active = !browseAll && selectedAgencies.includes(a.slug);
            return (
              <span
                key={a.slug}
                onClick={() => { if (browseAll) setBrowseAll(false); toggleAgency(a.slug); }}
                className={`chip ${active ? 'chip-selected' : ''}`}
                style={{
                  padding: '5px 11px', borderRadius: 'var(--sa-radius-pill)', fontSize: 12, fontWeight: 500,
                  background: active ? 'var(--sa-chip-selected-bg)' : 'var(--sa-bg-card)',
                  color: active ? 'var(--sa-chip-selected-fg)' : 'var(--sa-text-default)',
                  border: `1px solid ${active ? 'var(--sa-chip-selected-border)' : 'var(--sa-border)'}`,
                  opacity: browseAll ? 0.4 : 1,
                }}
              >
                {a.short}
              </span>
            );
          })}
          <div style={{ width: 1, height: 16, background: 'var(--sa-border)', margin: '0 4px' }} />
          <span
            onClick={() => setBrowseAll(!browseAll)}
            className={`chip ${browseAll ? 'chip-selected' : ''}`}
            style={{
              padding: '5px 11px', borderRadius: 'var(--sa-radius-pill)', fontSize: 12, fontWeight: 500,
              background: browseAll ? 'var(--sa-chip-selected-bg)' : 'var(--sa-bg-card)',
              color: browseAll ? 'var(--sa-chip-selected-fg)' : 'var(--sa-text-default)',
              border: `1px solid ${browseAll ? 'var(--sa-chip-selected-border)' : 'var(--sa-border)'}`,
            }}
          >
            {browseAll ? '✓ ' : ''}Browse all Federal Register
          </span>
          <button
            onClick={() => setRequestOpen(true)}
            className="btn"
            style={{
              display: 'flex', alignItems: 'center', gap: 3, marginLeft: 'auto',
              padding: '4px 8px', background: 'transparent', color: 'var(--sa-text-link)',
              fontSize: 11, fontWeight: 500, cursor: 'pointer',
            }}
          >
            <Plus size={12} />
            Request an agency
          </button>
        </div>

        {/* Type filters, collapsible */}
        {showFilters && (
          <div className="fade-in" style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--sa-text-muted)', fontWeight: 500, marginRight: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Document type
            </span>
            {DOC_TYPES.map(t => {
              const active = selectedTypes.includes(t.code);
              return (
                <span
                  key={t.code}
                  onClick={() => toggleType(t.code)}
                  className={`chip ${active ? 'chip-selected' : ''}`}
                  style={{
                    padding: '5px 11px', borderRadius: 'var(--sa-radius-pill)', fontSize: 12, fontWeight: 500,
                    background: active ? 'var(--sa-chip-selected-bg)' : 'var(--sa-bg-card)',
                    color: active ? 'var(--sa-chip-selected-fg)' : 'var(--sa-text-default)',
                    border: `1px solid ${active ? 'var(--sa-chip-selected-border)' : 'var(--sa-border)'}`,
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
      <div style={{ display: 'grid', gridTemplateColumns: sideBySide ? 'minmax(0, 1fr) minmax(380px, 460px)' : '1fr', alignItems: 'flex-start' }}>
        {/* LEFT: feed */}
        <section style={{ padding: '20px clamp(16px, 3vw, 32px) 32px' }}>
          {loading && filtered.length === 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, color: 'var(--sa-text-muted)' }}>
              <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ marginLeft: 10, fontSize: 13 }}>Loading from Federal Register…</span>
            </div>
          )}

          {error && (
            <div style={{ padding: 16, background: '#fef3f2', border: '1px solid #f5c6c0', borderRadius: 6, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <AlertCircle size={18} color="#a13a2a" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--sa-text-default)' }}>Connection error</div>
                <div style={{ fontSize: 12, color: 'var(--sa-text-secondary)', marginTop: 2 }}>{error}</div>
                <button onClick={fetchDocs} className="btn" style={{ marginTop: 8, background: 'var(--sa-text-default)', color: 'var(--sa-bg-card)', padding: '5px 12px', fontSize: 12, fontWeight: 500, borderRadius: 4 }}>Retry</button>
              </div>
            </div>
          )}

          {!loading && !error && filtered.length === 0 && lastUpdated && (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--sa-text-muted)' }}>
              <FileText size={28} style={{ opacity: 0.4, marginBottom: 10 }} />
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--sa-text-default)' }}>
                No documents match your filters
              </div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                Try widening your date range or agency selection.
              </div>
            </div>
          )}

          {!error && filtered.length > 0 && (
            <div style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.15s ease', pointerEvents: loading ? 'none' : 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--sa-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {browseAll ? 'All Federal Register' : 'Financial regulators'}
                  <span style={{ color: 'var(--sa-text-muted)', fontWeight: 500, marginLeft: 8 }}>
                    · {filtered.length} {filtered.length === 1 ? 'document' : 'documents'}
                  </span>
                </h2>
                <span style={{ fontSize: 11, color: 'var(--sa-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Newest first
                </span>
              </div>

              <div style={{ border: '1px solid var(--sa-border)', borderRadius: 6, overflow: 'hidden', background: 'var(--sa-bg-card)' }}>
                {pinnedRows.length > 0 && (
                  <>
                    <button
                      onClick={() => setPinnedExpanded(v => !v)}
                      className="btn"
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 16px', background: 'var(--sa-bg-elevated)',
                        borderBottom: '1px solid var(--sa-border)',
                        fontSize: 11, fontWeight: 600, color: 'var(--sa-text-secondary)',
                        textTransform: 'uppercase', letterSpacing: '0.04em',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Pin size={11} style={{ fill: 'currentColor', transform: 'rotate(-15deg)' }} />
                        Pinned · {pinnedRows.length}
                      </span>
                      <ChevronDown size={14} style={{ transform: pinnedExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.12s ease' }} />
                    </button>
                    {pinnedExpanded && pinnedRows.map((doc, idx) => renderDocRow(doc, idx, pinnedRows.length, true))}
                  </>
                )}
                {unpinnedRows.map((doc, idx) => renderDocRow(doc, idx, unpinnedRows.length, false))}
              </div>
            </div>
          )}
        </section>

        {/* RIGHT: detail panel — side-by-side on wide iframes, overlay drawer on narrow */}
        {overlayDetail && (
          <div
            onClick={() => setSelectedDoc(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 60,
              background: 'rgba(25, 22, 16, 0.35)',
              animation: 'fadeIn 0.15s ease-out',
            }}
          />
        )}
        {selectedDoc && (
          <aside
            className="detail-panel"
            onClick={(e) => e.stopPropagation()}
            style={sideBySide ? {
              position: 'sticky', top: 0, maxHeight: '100vh',
              background: 'var(--sa-bg-card)', borderLeft: '1px solid var(--sa-border)',
              display: 'flex', flexDirection: 'column',
            } : {
              position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 70,
              width: '92%', maxWidth: 460,
              background: 'var(--sa-bg-card)', borderLeft: '1px solid var(--sa-border)',
              boxShadow: '-10px 0 30px rgba(0,0,0,0.12)',
              display: 'flex', flexDirection: 'column',
            }}>
            <div style={{ padding: '20px 24px 14px', borderBottom: '1px solid var(--sa-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                  {(() => {
                    const ts = TYPE_STYLES[selectedDoc.type] || { bg: '#f0f0f0', fg: 'var(--sa-text-default)', label: selectedDoc.type };
                    return (
                      <span style={{
                        fontSize: 10, fontWeight: 600,
                        background: ts.bg, color: ts.fg, padding: '3px 9px', borderRadius: 'var(--sa-radius-pill)', textTransform: 'uppercase', letterSpacing: '0.04em',
                      }}>{ts.label}</span>
                    );
                  })()}
                  {selectedDoc.significant && (
                    <span style={{
                      fontSize: 10, fontWeight: 600,
                      color: '#a13a2a', background: '#fef3f2',
                      padding: '3px 9px', borderRadius: 'var(--sa-radius-pill)', textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}>
                      ◆ Significant
                    </span>
                  )}
                </div>
                <h2 style={{ margin: 0, fontFamily: 'var(--sa-font-serif)', fontSize: 22, fontWeight: 500, lineHeight: 1.25, color: 'var(--sa-text-default)', letterSpacing: '-0.005em' }}>
                  {selectedDoc.title}
                </h2>
              </div>
              <button
                onClick={() => setSelectedDoc(null)}
                className="btn"
                style={{ background: 'transparent', padding: 4, color: 'var(--sa-text-muted)', border: 'none', flexShrink: 0 }}
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
                    background: 'var(--sa-text-default)', color: 'var(--sa-bg-card)', padding: '8px 12px', fontSize: 12, fontWeight: 500,
                    textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 5,
                  }}>
                    <Download size={13} /> PDF
                  </a>
                )}
                {selectedDoc.html_url && (
                  <a href={selectedDoc.html_url} target="_blank" rel="noopener noreferrer" className="btn" style={{
                    background: 'var(--sa-bg-card)', color: 'var(--sa-text-default)', padding: '8px 12px', fontSize: 12, fontWeight: 500,
                    textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    border: '1px solid var(--sa-border)', borderRadius: 5,
                  }}>
                    <ExternalLink size={13} /> View on FR
                  </a>
                )}
                {selectedDoc.raw_text_url && (
                  <a href={selectedDoc.raw_text_url} target="_blank" rel="noopener noreferrer" className="btn" style={{
                    background: 'var(--sa-bg-card)', color: 'var(--sa-text-default)', padding: '8px 12px', fontSize: 12, fontWeight: 500,
                    textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    border: '1px solid var(--sa-border)', borderRadius: 5,
                  }}>
                    <FileText size={13} /> Plain text
                  </a>
                )}
                <button
                  onClick={() => togglePin(selectedDoc)}
                  className="btn"
                  style={{
                    background: isPinned(selectedDoc.document_number) ? 'var(--sa-bg-elevated)' : 'var(--sa-bg-card)',
                    color: 'var(--sa-text-default)',
                    padding: '8px 12px', fontSize: 12, fontWeight: 500,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    border: `1px solid ${isPinned(selectedDoc.document_number) ? 'var(--sa-text-default)' : 'var(--sa-border)'}`, borderRadius: 5,
                  }}
                >
                  {isPinned(selectedDoc.document_number) ? <><Pin size={13} style={{ fill: 'currentColor', transform: 'rotate(-15deg)' }} /> Pinned</> : <><Pin size={13} style={{ transform: 'rotate(-15deg)' }} /> Pin</>}
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
                      if (d < 0) return { text: 'Closed', color: 'var(--sa-text-secondary)', bg: '#f0f0f0' };
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
                      <div key={i} style={{ fontSize: 12, color: 'var(--sa-text-default)', display: 'flex', alignItems: 'center', gap: 6 }}>
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
                        fontSize: 11, background: 'var(--sa-bg-elevated)', padding: '3px 8px', borderRadius: 3, color: 'var(--sa-text-default)', fontWeight: 500,
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
                        fontSize: 11, background: 'var(--sa-bg-card)', padding: '3px 8px', borderRadius: 3,
                        border: '1px solid var(--sa-border)', color: 'var(--sa-text-default)',
                      }}>
                        {t}
                      </span>
                    ))}
                  </div>
                </DetailSection>
              )}

              {selectedDoc.abstract && (
                <DetailSection title="Abstract">
                  <p style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--sa-text-default)', margin: 0 }}>
                    {selectedDoc.abstract}
                  </p>
                </DetailSection>
              )}
            </div>
          </aside>
        )}
      </div>

      {requestOpen && <RequestAgencyModal onClose={() => setRequestOpen(false)} />}
    </div>
  );
}

function RequestAgencyModal({ onClose }) {
  const [email, setEmail] = useState('');
  const [agency, setAgency] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const [errorMsg, setErrorMsg] = useState(null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit = emailValid && agency.trim().length > 0 && status !== 'sending';

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus('sending');
    setErrorMsg(null);
    try {
      const res = await fetch('/api/request-agency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), agency: agency.trim(), note: note.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setStatus('sent');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message || 'Something went wrong');
    }
  };

  const fieldStyle = {
    width: '100%', padding: '8px 12px', fontSize: 13, fontFamily: 'inherit',
    background: 'var(--sa-bg-card)', border: '1px solid var(--sa-border)', borderRadius: 6,
    color: 'var(--sa-text-default)',
  };
  const labelStyle = { fontSize: 11, fontWeight: 500, color: 'var(--sa-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, display: 'block' };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(25, 22, 16, 0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, animation: 'fadeIn 0.15s ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 460, background: 'var(--sa-bg-card)',
          borderRadius: 8, border: '1px solid var(--sa-border)',
          boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
          animation: 'slideIn 0.18s ease-out',
        }}
      >
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--sa-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: 'var(--sa-font-serif)', fontSize: 22, fontWeight: 500, lineHeight: 1.25, color: 'var(--sa-text-default)' }}>
              Request an agency
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--sa-text-secondary)' }}>
              Tell us which federal agency to add. We'll email you when it's available.
            </p>
          </div>
          <button
            onClick={onClose}
            className="btn"
            style={{ background: 'transparent', padding: 4, color: 'var(--sa-text-muted)', border: 'none' }}
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        {status === 'sent' ? (
          <div style={{ padding: '32px 22px', textAlign: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#e8f3ec', color: '#1a6b3a', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Check size={22} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--sa-text-default)' }}>Request sent</div>
            <div style={{ fontSize: 12, color: 'var(--sa-text-secondary)', marginTop: 4 }}>
              We'll be in touch at {email}.
            </div>
            <button
              onClick={onClose}
              className="btn"
              style={{
                marginTop: 18, padding: '8px 18px', background: 'var(--sa-text-default)',
                color: 'var(--sa-bg-card)', borderRadius: 6, fontSize: 13, fontWeight: 500,
              }}
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} style={{ padding: '18px 22px 20px' }}>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Confirm email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@stateaffairs.com"
                autoFocus
                required
                style={fieldStyle}
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Agency name</label>
              <input
                type="text"
                value={agency}
                onChange={(e) => setAgency(e.target.value)}
                placeholder="e.g. Securities and Exchange Commission"
                required
                style={fieldStyle}
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Additional info <span style={{ textTransform: 'none', color: 'var(--sa-text-muted)', fontWeight: 400 }}>(optional)</span></label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Anything else we should know?"
                rows={4}
                style={{ ...fieldStyle, resize: 'vertical', minHeight: 80, fontFamily: 'inherit' }}
              />
            </div>

            {status === 'error' && (
              <div style={{
                marginBottom: 12, padding: '8px 12px', fontSize: 12,
                background: '#fef3f2', border: '1px solid #f5c6c0', borderRadius: 6,
                color: '#a13a2a', display: 'flex', gap: 8, alignItems: 'flex-start',
              }}>
                <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{errorMsg}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={onClose}
                className="btn"
                style={{
                  padding: '8px 14px', background: 'var(--sa-bg-card)', color: 'var(--sa-text-default)',
                  border: '1px solid var(--sa-border)', borderRadius: 6, fontSize: 13, fontWeight: 500,
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="btn"
                style={{
                  padding: '8px 14px', background: 'var(--sa-text-default)', color: 'var(--sa-bg-card)',
                  border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 500,
                  display: 'flex', alignItems: 'center', gap: 6,
                  opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? 'pointer' : 'default',
                }}
              >
                {status === 'sending' && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
                {status === 'sending' ? 'Sending…' : 'Send request'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div style={{ background: 'var(--sa-bg-card)', padding: '12px 16px', borderRadius: 6, border: '1px solid var(--sa-border)' }}>
      <div style={{ fontSize: 24, fontWeight: 600, color: accent || 'var(--sa-text-default)', lineHeight: 1.1, letterSpacing: '-0.01em' }}>
        {value.toLocaleString()}
      </div>
      <div style={{ fontSize: 11, color: 'var(--sa-text-muted)', textTransform: 'uppercase', fontWeight: 500, letterSpacing: '0.04em', marginTop: 4 }}>
        {label}
      </div>
    </div>
  );
}

function DetailSection({ title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        fontSize: 11, color: 'var(--sa-text-muted)', textTransform: 'uppercase', fontWeight: 500, letterSpacing: '0.04em',
        marginBottom: 8, paddingBottom: 5, borderBottom: '1px solid var(--sa-border)',
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
      <span style={{ fontSize: 12, color: 'var(--sa-text-secondary)', flexShrink: 0 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, textAlign: 'right' }}>
        <span style={{ fontSize: 12, color: 'var(--sa-text-default)', fontWeight: 500 }}>
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
