import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { searchNdcDirectory } from './fdaNdc'

const initialProducts = [
  { id: 1, name: 'Amoxicillin', generic: 'Amoxicillin trihydrate', strength: '500 mg', form: 'Capsule', sku: 'AMX-500-30', barcode: '0037812340012', stock: 184, reorder: 80, location: 'Main store', batch: 'AMX2406A', expiry: '2027-06-30', supplier: 'McKesson', status: 'In stock', color: 'blue' },
  { id: 2, name: 'Lisinopril', generic: 'Lisinopril', strength: '10 mg', form: 'Tablet', sku: 'LIS-010-90', barcode: '0037812340199', stock: 42, reorder: 60, location: 'Dispensary', batch: 'LIS2402C', expiry: '2026-11-18', supplier: 'Cardinal Health', status: 'Low stock', color: 'orange' },
  { id: 3, name: 'Metformin HCL', generic: 'Metformin hydrochloride', strength: '500 mg', form: 'Tablet', sku: 'MET-500-100', barcode: '0037812340243', stock: 317, reorder: 100, location: 'Main store', batch: 'MET2408F', expiry: '2027-08-04', supplier: 'McKesson', status: 'In stock', color: 'green' },
  { id: 4, name: 'Atorvastatin', generic: 'Atorvastatin calcium', strength: '20 mg', form: 'Tablet', sku: 'ATO-020-90', barcode: '0037812340311', stock: 96, reorder: 75, location: 'Dispensary', batch: 'ATO2401B', expiry: '2026-09-12', supplier: 'AmerisourceBergen', status: 'Expiring soon', color: 'purple' },
  { id: 5, name: 'Omeprazole', generic: 'Omeprazole', strength: '20 mg', form: 'Capsule', sku: 'OME-020-30', barcode: '0037812340458', stock: 71, reorder: 50, location: 'Main store', batch: 'OME2407D', expiry: '2027-02-27', supplier: 'Cardinal Health', status: 'In stock', color: 'teal' },
  { id: 6, name: 'Albuterol HFA', generic: 'Albuterol sulfate', strength: '90 mcg', form: 'Inhaler', sku: 'ALB-HFA-01', barcode: '0037812340564', stock: 28, reorder: 35, location: 'Dispensary', batch: 'ALB2403A', expiry: '2026-10-09', supplier: 'McKesson', status: 'Low stock', color: 'red' },
]

const initialMovements = [
  { id: 1, type: 'Receipt', product: 'Amoxicillin 500 mg', batch: 'AMX2406A', quantity: '+120', user: 'Jordan Lee', time: 'Today, 09:42', tone: 'positive' },
  { id: 2, type: 'Dispense', product: 'Metformin HCL 500 mg', batch: 'MET2408F', quantity: '-24', user: 'Maya Patel', time: 'Today, 09:18', tone: 'negative' },
  { id: 3, type: 'Adjustment', product: 'Lisinopril 10 mg', batch: 'LIS2402C', quantity: '-3', user: 'Jordan Lee', time: 'Yesterday, 16:05', tone: 'warning' },
  { id: 4, type: 'Transfer', product: 'Omeprazole 20 mg', batch: 'OME2407D', quantity: '+18', user: 'Maya Patel', time: 'Yesterday, 14:22', tone: 'positive' },
]

const initialAlerts = [
  { id: 1, type: 'Low stock', title: 'Lisinopril 10 mg', detail: '42 units remaining · reorder at 60', severity: 'warning', action: 'Create order' },
  { id: 2, type: 'Expiring', title: 'Atorvastatin 20 mg', detail: 'Batch ATO2401B expires Sep 12, 2026', severity: 'urgent', action: 'Review batch' },
  { id: 3, type: 'Low stock', title: 'Albuterol HFA', detail: '28 units remaining · reorder at 35', severity: 'warning', action: 'Create order' },
]

function Icon({ name, size = 18 }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    box: <><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/></>,
    activity: <><path d="M3 12h4l2-7 4 14 2-7h6"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/></>,
    truck: <><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="19" r="2"/><circle cx="18" cy="19" r="2"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    filter: <path d="M4 6h16M7 12h10M10 18h4"/>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function App() {
  const [page, setPage] = useState('Dashboard')
  const [products, setProducts] = useState(initialProducts)
  const [movements, setMovements] = useState(initialMovements)
  const [alerts, setAlerts] = useState(initialAlerts)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('All stock')
  const [modal, setModal] = useState(null)
  const [selected, setSelected] = useState(null)

  const filteredProducts = useMemo(() => products.filter((product) => {
    const matchesQuery = `${product.name} ${product.generic} ${product.sku} ${product.ndc || ''} ${product.barcode || ''} ${product.manufacturer || ''}`.toLowerCase().includes(query.toLowerCase())
    const matchesFilter = filter === 'All stock' || product.status === filter
    return matchesQuery && matchesFilter
  }), [products, query, filter])

  const addProduct = (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const product = { id: Date.now(), name: form.get('name'), generic: form.get('generic') || 'Not specified', strength: form.get('strength'), form: form.get('form'), sku: form.get('sku') || 'NEW-ITEM', barcode: form.get('barcode') || 'Pending', ndc: form.get('ndc') || '', packageDescription: form.get('packageDescription') || '', manufacturer: form.get('manufacturer') || '', stock: Number(form.get('stock') || 0), reorder: Number(form.get('reorder') || 0), location: 'Main store', batch: 'NEW-BATCH', expiry: form.get('expiry') || '2027-12-31', supplier: 'New supplier', status: 'In stock', color: 'teal' }
    setProducts((items) => [product, ...items])
    setModal(null)
  }

  const recordMovement = (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const product = products.find((item) => item.id === Number(form.get('product')))
    const quantity = Number(form.get('quantity'))
    const direction = form.get('type') === 'Receipt' || form.get('type') === 'Customer return' ? 1 : -1
    setProducts((items) => items.map((item) => item.id === product.id ? { ...item, stock: Math.max(0, item.stock + quantity * direction) } : item))
    setMovements((items) => [{ id: Date.now(), type: form.get('type'), product: `${product.name} ${product.strength}`, batch: product.batch, quantity: `${direction > 0 ? '+' : '-'}${quantity}`, user: 'Jordan Lee', time: 'Just now', tone: direction > 0 ? 'positive' : 'negative' }, ...items])
    setModal(null)
  }

  const pageTitle = page === 'Dashboard' ? 'Good morning, Jordan' : page
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><span></span><span></span><span></span></div><div><strong>northline</strong><small>pharmacy operations</small></div></div>
      <div className="location-switch"><span className="status-dot"></span><div><small>Current location</small><strong>Main Pharmacy</strong></div><Icon name="chevron" size={15}/></div>
      <nav className="nav-group"><p>Workspace</p>{[['Dashboard','grid'],['Inventory','box'],['Movements','activity'],['Alerts','bell'],['Suppliers','truck']].map(([label, icon]) => <button key={label} className={page === label ? 'nav-item active' : 'nav-item'} onClick={() => setPage(label)}><Icon name={icon}/><span>{label}</span>{label === 'Alerts' && <b>{alerts.length}</b>}</button>)}</nav>
      <div className="sidebar-bottom"><button className="help-link">◌ <span>Help &amp; support</span></button><div className="user-card"><div className="avatar">JL</div><div><strong>Jordan Lee</strong><small>Administrator</small></div><span>•••</span></div></div>
    </aside>
    <main className="main-content">
      <header className="topbar"><div className="breadcrumb"><span>Northline Pharmacy</span><Icon name="chevron" size={14}/><strong>{page}</strong></div><div className="top-actions"><div className="system-status"><span className="status-dot"></span>All systems operational</div><button className="icon-button"><Icon name="bell"/></button><div className="mini-avatar">JL</div></div></header>
      <div className="content-wrap">
        <div className="page-heading"><div><div className="eyebrow">Saturday, August 30, 2026 <span className="heading-line"></span> Main Pharmacy</div><h1>{pageTitle}</h1><p>{page === 'Dashboard' ? 'Here is today’s inventory pulse across your pharmacy.' : `Manage your ${page.toLowerCase()} with clear, auditable workflows.`}</p></div><div className="heading-actions"><button className="button secondary" onClick={() => setModal('movement')}><Icon name="activity" size={16}/> Record movement</button><button className="button primary" onClick={() => setModal('product')}><Icon name="plus" size={16}/> Add product</button></div></div>
        {page === 'Dashboard' && <Dashboard products={products} movements={movements} alerts={alerts} setPage={setPage} setSelected={setSelected} setModal={setModal} />}
        {page === 'Inventory' && <Inventory products={filteredProducts} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} setSelected={setSelected} setModal={setModal} />}
        {page === 'Movements' && <Movements movements={movements} />}
        {page === 'Alerts' && <Alerts alerts={alerts} setAlerts={setAlerts} />}
        {page === 'Suppliers' && <Suppliers products={products} />}
      </div>
    </main>
    {selected && <ProductModal product={selected} onClose={() => setSelected(null)} />}
    {modal === 'product' && <Modal title="Add new product" subtitle="Find an FDA-listed package, then add your pharmacy’s stock controls." onClose={() => setModal(null)}><ProductForm onSubmit={addProduct} onCancel={() => setModal(null)} /></Modal>}
    {modal === 'movement' && <Modal title="Record inventory movement" subtitle="All changes are written to the audit ledger in the production workflow." onClose={() => setModal(null)}><form onSubmit={recordMovement} className="form-grid"><label>Product<select name="product">{products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.strength}</option>)}</select></label><label>Movement type<select name="type"><option>Receipt</option><option>Dispense</option><option>Adjustment</option><option>Customer return</option><option>Damaged</option></select></label><label>Quantity<input name="quantity" type="number" min="1" required placeholder="0" /></label><label>Reason<input name="reason" placeholder="Optional reference or reason" /></label><div className="form-actions"><button type="button" className="button secondary" onClick={() => setModal(null)}>Cancel</button><button className="button primary" type="submit">Post movement <Icon name="arrow" size={15}/></button></div></form></Modal>}
  </div>
}

function ProductForm({ onSubmit, onCancel }) {
  const [lookup, setLookup] = useState('')
  const [results, setResults] = useState([])
  const [selectedNdc, setSelectedNdc] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const value = lookup.trim()
    if (value.length < 2) {
      setResults([])
      setError('')
      setLoading(false)
      return undefined
    }

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      setError('')
      try {
        setResults(await searchNdcDirectory(value, controller.signal))
      } catch (lookupError) {
        if (lookupError.name !== 'AbortError') setError(lookupError.message)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 450)

    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [lookup])

  const chooseResult = (result) => {
    setSelectedNdc(result)
    setLookup(result.ndc)
    setResults([])
  }

  return <form key={selectedNdc?.id || 'manual'} onSubmit={onSubmit} className="form-grid product-form">
    <div className="ndc-lookup">
      <div className="lookup-heading"><div><span className="eyebrow">FDA reference lookup</span><strong>Find a listed package</strong></div>{loading && <span className="lookup-state">Searching…</span>}</div>
      <div className="lookup-input"><Icon name="search" size={16}/><input value={lookup} onChange={(event) => { setLookup(event.target.value); setSelectedNdc(null) }} placeholder="Search brand, generic, or NDC" aria-label="Search FDA NDC directory" /></div>
      {error && <p className="lookup-message error">{error}</p>}
      {!loading && lookup.trim().length >= 2 && !error && results.length === 0 && !selectedNdc && <p className="lookup-message">No FDA-listed packages found. You can still enter the product manually.</p>}
      {results.length > 0 && <div className="ndc-results">{results.map((result) => <button type="button" className="ndc-result" key={result.id} onClick={() => chooseResult(result)}><span className="ndc-result-main"><strong>{result.brandName || result.genericName || 'Unnamed product'}</strong><small>{result.genericName || result.ingredients || 'Ingredient details unavailable'} · {result.dosageForm || 'Form unavailable'}</small></span><span className="ndc-result-meta"><code>{result.ndc}</code><small>{result.labelerName || 'Labeler unavailable'}</small></span></button>)}</div>}
      <small className="lookup-disclaimer">FDA data is reference information submitted by labelers; verify the physical package before receiving stock.</small>
    </div>
    <label>Product name<input name="name" required defaultValue={selectedNdc?.brandName || ''} placeholder="e.g. Amoxicillin" /></label>
    <label>Generic name<input name="generic" defaultValue={selectedNdc?.genericName || selectedNdc?.ingredients || ''} placeholder="Active ingredient" /></label>
    <label>Strength<input name="strength" required defaultValue={selectedNdc?.ingredients || ''} placeholder="e.g. 500 mg" /></label>
    <label>Dosage form<select name="form" defaultValue={selectedNdc?.dosageForm || 'Tablet'}><option>Tablet</option><option>Capsule</option><option>Inhaler</option><option>Liquid</option><option>Other</option></select></label>
    <label>Initial stock<input name="stock" type="number" min="0" defaultValue="0" /></label>
    <label>Reorder point<input name="reorder" type="number" min="0" defaultValue="25" /></label>
    <label>SKU<input name="sku" placeholder="Internal SKU" /></label>
    <label>Barcode<input name="barcode" placeholder="Scan or enter barcode" /></label>
    <label>Expiry date<input name="expiry" type="date" /></label>
    <input type="hidden" name="ndc" value={selectedNdc?.ndc || ''} />
    <input type="hidden" name="packageDescription" value={selectedNdc?.packageDescription || ''} />
    <input type="hidden" name="manufacturer" value={selectedNdc?.labelerName || ''} />
    {selectedNdc && <div className="selected-source"><span className="status-dot"></span><span>Using FDA package <code>{selectedNdc.ndc}</code> from {selectedNdc.labelerName || 'listed labeler'}</span><button type="button" onClick={() => setSelectedNdc(null)}>Clear</button></div>}
    <div className="form-actions"><button type="button" className="button secondary" onClick={onCancel}>Cancel</button><button className="button primary" type="submit">Create product <Icon name="arrow" size={15}/></button></div>
  </form>
}

function Dashboard({ products, movements, alerts, setPage, setSelected, setModal }) { return <>
  <section className="pulse-card"><div className="pulse-copy"><span className="pulse-kicker"><span className="pulse-live"></span> Inventory pulse</span><h2>Healthy stock, with <em>3 things</em> to review.</h2><p>Your shelves are moving well today. Two products need a reorder and one batch is approaching expiry.</p><button className="text-button" onClick={() => setPage('Alerts')}>View attention queue <Icon name="arrow" size={15}/></button></div><div className="pulse-visual"><div className="ring ring-one"><div className="ring ring-two"><div className="ring-core"><strong>92%</strong><small>stock health</small></div></div></div><div className="pulse-label label-top"><b>184</b><span>active products</span></div><div className="pulse-label label-bottom"><b>7.4k</b><span>units on hand</span></div></div></section>
  <section className="stat-grid">{[['Available units','7,426','Across 2 locations','teal'],['Inventory value','$48,290.60','+4.8% this month','blue'],['Low stock','2 products','Needs attention','orange'],['Expiring soon','1 batch','Within 30 days','red']].map(([title,value,sub,tone]) => <div className="stat-card" key={title}><div className={`stat-icon ${tone}`}><Icon name={tone === 'orange' || tone === 'red' ? 'bell' : tone === 'blue' ? 'activity' : 'box'} size={17}/></div><span className="stat-title">{title}</span><strong>{value}</strong><small className={tone === 'blue' ? 'positive-text' : ''}>{sub}</small></div>)}</section>
  <div className="section-grid"><section className="panel movement-panel"><div className="panel-heading"><div><span className="eyebrow">Live ledger</span><h3>Recent movements</h3></div><button className="link-button" onClick={() => setPage('Movements')}>View all <Icon name="arrow" size={14}/></button></div><div className="movement-list">{movements.slice(0,4).map((movement) => <div className="movement-row" key={movement.id}><div className={`movement-icon ${movement.tone}`}><Icon name={movement.type === 'Transfer' ? 'arrow' : movement.type === 'Receipt' ? 'plus' : 'activity'} size={15}/></div><div className="movement-main"><strong>{movement.product}</strong><span>{movement.type} · Batch {movement.batch}</span></div><div className={`movement-quantity ${movement.tone}`}>{movement.quantity}</div><div className="movement-time">{movement.time}<small>{movement.user}</small></div></div>)}</div></section><section className="panel alert-panel"><div className="panel-heading"><div><span className="eyebrow coral">Action queue</span><h3>Needs attention <span className="count-badge">{alerts.length}</span></h3></div><button className="link-button" onClick={() => setPage('Alerts')}>See queue <Icon name="arrow" size={14}/></button></div><div className="alert-list">{alerts.slice(0,3).map((alert) => <div className="alert-row" key={alert.id}><div className={`alert-marker ${alert.severity}`}></div><div><strong>{alert.title}</strong><span>{alert.detail}</span></div><button className="dots-button">•••</button></div>)}</div><button className="queue-button" onClick={() => setModal('movement')}><Icon name="plus" size={15}/> Resolve through movement</button></section></div>
  <section className="panel inventory-preview"><div className="panel-heading"><div><span className="eyebrow">Catalog overview</span><h3>Inventory at a glance</h3></div><button className="link-button" onClick={() => setPage('Inventory')}>Open inventory <Icon name="arrow" size={14}/></button></div><InventoryTable products={products.slice(0,5)} onSelect={setSelected}/></section>
</> }

function Inventory({ products, query, setQuery, filter, setFilter, setSelected, setModal }) { return <section className="panel inventory-page"><div className="toolbar"><div className="search-box"><Icon name="search" size={17}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products, SKU, or barcode" /></div><div className="filter-wrap"><Icon name="filter" size={15}/><select value={filter} onChange={(e) => setFilter(e.target.value)}><option>All stock</option><option>In stock</option><option>Low stock</option><option>Expiring soon</option></select></div><button className="button primary compact" onClick={() => setModal('product')}><Icon name="plus" size={15}/> Add product</button></div><div className="inventory-meta"><span>Showing <strong>{products.length}</strong> products</span><span className="fefo-note">FEFO ordering active <span className="status-dot"></span></span></div><InventoryTable products={products} onSelect={setSelected}/></section> }
function InventoryTable({ products, onSelect }) { return <div className="table-wrap"><table><thead><tr><th>Product</th><th>SKU / NDC</th><th>On hand</th><th>Location</th><th>Next expiry</th><th>Status</th><th></th></tr></thead><tbody>{products.map((product) => <tr key={product.id} onClick={() => onSelect(product)}><td><div className="product-cell"><span className={`product-avatar ${product.color}`}>{product.name.slice(0,2).toUpperCase()}</span><div><strong>{product.name}</strong><span>{product.generic} · {product.strength}</span></div></div></td><td><code>{product.sku}</code><small>{product.ndc || product.barcode}</small></td><td><strong className={product.stock <= product.reorder ? 'low-number' : ''}>{product.stock}</strong><small>units</small></td><td>{product.location}</td><td><span className={product.status === 'Expiring soon' ? 'expiry-date' : ''}>{product.expiry}</span></td><td><span className={`status-pill ${product.status.toLowerCase().replace(' ', '-')}`}>{product.status}</span></td><td><Icon name="chevron" size={16}/></td></tr>)}</tbody></table></div> }
function Movements({ movements }) { return <section className="panel inventory-page"><div className="panel-heading"><div><span className="eyebrow">Immutable activity</span><h3>Movement ledger</h3></div><button className="button secondary compact">Export CSV</button></div><div className="ledger-list">{movements.concat(movements).map((movement, index) => <div className="ledger-row" key={`${movement.id}-${index}`}><div className={`movement-icon ${movement.tone}`}><Icon name={movement.type === 'Receipt' ? 'plus' : movement.type === 'Transfer' ? 'arrow' : 'activity'} size={15}/></div><div className="ledger-type"><strong>{movement.type}</strong><span>{movement.time}</span></div><div className="ledger-product"><strong>{movement.product}</strong><span>Batch {movement.batch}</span></div><div className={`movement-quantity ${movement.tone}`}>{movement.quantity}</div><div className="ledger-user"><div className="tiny-avatar">{movement.user.split(' ').map((x) => x[0]).join('')}</div>{movement.user}</div><Icon name="chevron" size={16}/></div>)}</div></section> }
function Alerts({ alerts, setAlerts }) { return <section className="alert-page-grid"><div className="panel alert-page"><div className="panel-heading"><div><span className="eyebrow coral">Action queue</span><h3>Resolve inventory alerts</h3></div><span className="open-label">{alerts.length} open</span></div>{alerts.map((alert) => <div className="full-alert" key={alert.id}><div className={`alert-marker ${alert.severity}`}></div><div className="full-alert-copy"><span className="alert-type">{alert.type}</span><h4>{alert.title}</h4><p>{alert.detail}</p></div><button className="button secondary compact" onClick={() => setAlerts((items) => items.filter((item) => item.id !== alert.id))}>{alert.action}</button></div>)}{alerts.length === 0 && <div className="empty-state"><span>✓</span><h3>Queue cleared</h3><p>There are no open inventory alerts.</p></div>}</div><div className="panel alert-guide"><span className="eyebrow">Workflow note</span><h3>Keep exceptions visible.</h3><p>Alerts are derived from stock levels, expiry dates, and batch status. Resolve them through an auditable movement or review action.</p><div className="guide-rule"><span className="alert-marker urgent"></span><div><strong>Critical</strong><small>Recall, quarantine, or expired stock</small></div></div><div className="guide-rule"><span className="alert-marker warning"></span><div><strong>Attention</strong><small>Reorder or review upcoming expiry</small></div></div></div></section> }
function Suppliers({ products }) { const suppliers = [...new Set(products.map((p) => p.supplier))]; return <section className="supplier-grid">{suppliers.map((supplier, index) => <div className="supplier-card" key={supplier}><div className="supplier-top"><span className={`supplier-logo logo-${index}`}>{supplier.slice(0,1)}</span><span className="status-pill in-stock">Active</span></div><h3>{supplier}</h3><p>Preferred distribution partner</p><div className="supplier-stats"><div><strong>{products.filter((p) => p.supplier === supplier).length}</strong><span>products</span></div><div><strong>{products.filter((p) => p.supplier === supplier).reduce((sum, p) => sum + p.stock, 0)}</strong><span>units supplied</span></div></div><button className="link-button">View catalog <Icon name="arrow" size={14}/></button></div>)}</section> }
function Modal({ title, subtitle, onClose, children }) { return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className="modal"><button className="modal-close" onClick={onClose}><Icon name="close" size={19}/></button><span className="eyebrow">Inventory workflow</span><h2>{title}</h2><p>{subtitle}</p>{children}</div></div> }
function ProductModal({ product, onClose }) { return <Modal title={product.name} subtitle={`${product.generic} · ${product.strength} · ${product.form}`} onClose={onClose}><div className="detail-hero"><span className={`product-avatar ${product.color}`}>{product.name.slice(0,2).toUpperCase()}</span><div><span className={`status-pill ${product.status.toLowerCase().replace(' ', '-')}`}>{product.status}</span><strong>{product.stock} units on hand</strong></div></div><div className="detail-grid"><div><span>Batch</span><strong>{product.batch}</strong></div><div><span>Next expiry</span><strong>{product.expiry}</strong></div><div><span>Location</span><strong>{product.location}</strong></div><div><span>Supplier</span><strong>{product.supplier}</strong></div>{product.ndc && <div><span>FDA NDC</span><strong>{product.ndc}</strong></div>}{product.manufacturer && <div><span>Labeler</span><strong>{product.manufacturer}</strong></div>}</div>{product.ndc && <p className="source-note"><span className="status-dot"></span> FDA reference data attached · verify against the physical package.</p>}<button className="button primary full" onClick={onClose}>Done <Icon name="check" size={15}/></button></Modal> }

createRoot(document.getElementById('root')).render(<App />)