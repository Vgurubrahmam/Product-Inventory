import React, { useEffect, useState } from 'react';
import './App.css';

const API = import.meta.env.VITE_API_URL || 'https://product-inventory-delta-one.vercel.app';

function App() {
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [history, setHistory] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', unit: '', category: '', brand: '', stock: 0, status: 'Out of Stock', image: '' });
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => { fetchProducts(); }, []);

  async function fetchProducts() {
    const res = await fetch(`${API}/api/products`);
    const data = await res.json();
    setProducts(data);
  }

  async function handleSearch(e) {
    const q = e.target.value;
    setQuery(q);
    if (!q) return fetchProducts();
    const res = await fetch(`${API}/api/products/search?name=${encodeURIComponent(q)}`);
    const data = await res.json();
    setProducts(data);
  }

  function categories() {
    const cats = Array.from(new Set(products.map(p => p.category || '').filter(Boolean)));
    return ['All', ...cats];
  }

  function filteredProducts() {
    if (category === 'All') return products;
    return products.filter(p => (p.category||'') === category);
  }

  function startEdit(p) {
    setEditingId(p.id);
    setEditData({ ...p });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditData({});
  }

  async function saveEdit(id) {
    try {
      const res = await fetch(`${API}/api/products/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData)
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
      const updated = await res.json();
      setProducts(ps => ps.map(p => p.id === updated.id ? updated : p));
      setEditingId(null);
      setEditData({});
      
      // Refresh history if this product's history is currently open
      if (selectedProduct && selectedProduct.id === id) {
        const historyRes = await fetch(`${API}/api/products/${id}/history`);
        const historyData = await historyRes.json();
        setHistory(historyData);
      }
      
      alert('Saved');
    } catch (err) { alert('Error: ' + err.message); }
  }

  async function handleDelete(id) {
    if (!confirm('Delete product?')) return;
    await fetch(`${API}/api/products/${id}`, { method: 'DELETE' });
    setProducts(ps => ps.filter(p => p.id !== id));
  }

  async function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    setImporting(true);
    const fd = new FormData(); 
    fd.append('file', file);
    
    try {
      const res = await fetch(`${API}/api/products/import`, { method: 'POST', body: fd });
      const j = await res.json();
      
      if (j.duplicates && j.duplicates.length > 0) {
        alert(`Import complete.\nAdded: ${j.added}\nSkipped (duplicates): ${j.skipped}\n\nDuplicates:\n${j.duplicates.map(d => `- ${d.name} (ID: ${d.existingId})`).join('\n')}`);
      } else {
        alert(`Import complete.\nAdded: ${j.added}\nSkipped: ${j.skipped}`);
      }
      
      await fetchProducts(); // Refresh to show imported products
    } catch (err) {
      alert('Import failed: ' + err.message);
    } finally {
      setImporting(false);
      e.target.value = ''; // Reset file input
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch(`${API}/api/products/export`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; 
      a.download = `products_export_${new Date().toISOString().split('T')[0]}.csv`; 
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Export failed: ' + err.message);
    } finally {
      setExporting(false);
    }
  }

  async function openHistory(p) {
    setSelectedProduct(p);
    try {
      const res = await fetch(`${API}/api/products/${p.id}/history`);
      const data = await res.json();
      setHistory(data);
    } catch (err) {
      console.error('Failed to load history:', err);
      setHistory([]);
    }
  }

  async function handleAddNew() {
    setShowAddModal(true);
  }

  async function submitNewProduct() {
    if (!newProduct.name.trim()) {
      alert('Product name is required');
      return;
    }
    const res = await fetch(`${API}/api/products`, { 
      method: 'POST', 
      headers: {'Content-Type':'application/json'}, 
      body: JSON.stringify(newProduct) 
    });
    if (!res.ok) { 
      alert('Create failed'); 
      return; 
    }
    const created = await res.json();
    setProducts(ps => [created, ...ps]);
    setShowAddModal(false);
    setNewProduct({ name: '', unit: '', category: '', brand: '', stock: 0, status: 'Out of Stock', image: '' });
  }

  function closeAddModal() {
    setShowAddModal(false);
    setNewProduct({ name: '', unit: '', category: '', brand: '', stock: 0, status: 'Out of Stock', image: '' });
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <header className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-black">Product Inventory</h1>
          <div className="flex items-center space-x-2">
            <button 
              onClick={handleExport} 
              disabled={exporting}
              className={`px-3 py-1 rounded ${exporting ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'} text-white`}
            >
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
            <label className={`px-3 py-1 rounded cursor-pointer ${importing ? 'bg-green-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'} text-white`}>
              {importing ? 'Importing...' : 'Import CSV'}
              <input 
                type="file" 
                accept=".csv,text/csv" 
                onChange={handleImport} 
                disabled={importing}
                className="hidden" 
              />
            </label>
          </div>
        </header>

        <div className="bg-white p-4 rounded shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <input value={query} onChange={handleSearch} placeholder="Search by name..." className="border px-3 py-2 rounded" />
              <select value={category} onChange={e => setCategory(e.target.value)} className="border px-3 py-2 rounded">
                {categories().map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <button onClick={handleAddNew} className="px-3 py-1 bg-indigo-600 text-white rounded">Add New Product</button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full table-auto border-collapse text-black">
              <thead>
                <tr className="text-left">
                  <th className="p-2">Image</th>
                  <th className="p-2">Name</th>
                  <th className="p-2">Unit</th>
                  <th className="p-2">Category</th>
                  <th className="p-2">Brand</th>
                  <th className="p-2">Stock</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts().map(p => (
                  <tr key={p.id} className="border-t">
                    <td className="p-2"><img src={p.image||'/vite.svg'} alt="img" className="w-12 h-12 object-cover" /></td>
                    <td className="p-2" onClick={() => openHistory(p)}>
                      {editingId===p.id ? (
                        <input className="border px-2 py-1" value={editData.name} onChange={e=>setEditData({...editData,name:e.target.value})} />
                      ) : p.name}
                    </td>
                    <td className="p-2">{editingId===p.id ? <input value={editData.unit} onChange={e=>setEditData({...editData,unit:e.target.value})} className="border px-2 py-1" /> : p.unit}</td>
                    <td className="p-2">{editingId===p.id ? <input value={editData.category} onChange={e=>setEditData({...editData,category:e.target.value})} className="border px-2 py-1" /> : p.category}</td>
                    <td className="p-2">{editingId===p.id ? <input value={editData.brand} onChange={e=>setEditData({...editData,brand:e.target.value})} className="border px-2 py-1" /> : p.brand}</td>
                    <td className="p-2">{editingId===p.id ? <input type="number" value={editData.stock} onChange={e=>setEditData({...editData,stock:Number(e.target.value)})} className="border px-2 py-1 w-20" /> : p.stock}</td>
                    <td className="p-2">
                      <span className={`px-2 py-1 rounded text-sm ${p.status==='In Stock'? 'bg-green-100 text-green-800':'bg-red-100 text-red-800'}`}>{p.status}</span>
                    </td>
                    <td className="p-2">
                      {editingId===p.id ? (
                        <>
                          <button className="mr-2 px-2 py-1 bg-blue-600 text-white rounded" onClick={()=>saveEdit(p.id)}>Save</button>
                          <button className="px-2 py-1 bg-gray-300 rounded" onClick={cancelEdit}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <button className="mr-2 px-2 py-1 bg-yellow-400 rounded" onClick={()=>startEdit(p)}>Edit</button>
                          <button className="px-2 py-1 bg-red-600 text-white rounded" onClick={()=>handleDelete(p.id)}>Delete</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* History sidebar */}
        {selectedProduct && (
          <aside className="fixed right-6 top-24 w-96 bg-white p-4 rounded shadow-lg text-black">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold">History: {selectedProduct.name}</h3>
              <button onClick={()=>setSelectedProduct(null)} className="text-sm text-gray-500">Close</button>
            </div>
            <div className="text-sm text-gray-600 mb-2">Recent inventory updates</div>
            <div className="overflow-y-auto max-h-96">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left">Date</th>
                    <th className="text-right">Old</th>
                    <th className="text-right">New</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.id} className="border-t">
                      <td className="py-1">{h.timestamp}</td>
                      <td className="py-1 text-right">{h.oldStock}</td>
                      <td className="py-1 text-right">{h.newStock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </aside>
        )}

        {/* Add Product Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Add New Product</h2>
                <button onClick={closeAddModal} className="text-gray-500 hover:text-gray-700">&times;</button>
              </div>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Product Name *</label>
                  <input 
                    type="text" 
                    value={newProduct.name} 
                    onChange={e => setNewProduct({...newProduct, name: e.target.value})}
                    className="w-full border px-3 py-2 rounded bg-bg-secondary"
                    placeholder="Enter product name"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Unit</label>
                  <input 
                    type="text" 
                    value={newProduct.unit} 
                    onChange={e => setNewProduct({...newProduct, unit: e.target.value})}
                    className="w-full border px-3 py-2 rounded"
                    placeholder="e.g., pcs, kg, box"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Category</label>
                  <input 
                    type="text" 
                    value={newProduct.category} 
                    onChange={e => setNewProduct({...newProduct, category: e.target.value})}
                    className="w-full border px-3 py-2 rounded"
                    placeholder="e.g., Electronics, Groceries"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Brand</label>
                  <input 
                    type="text" 
                    value={newProduct.brand} 
                    onChange={e => setNewProduct({...newProduct, brand: e.target.value})}
                    className="w-full border px-3 py-2 rounded"
                    placeholder="Brand name"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Stock</label>
                  <input 
                    type="number" 
                    value={newProduct.stock} 
                    onChange={e => {
                      const stock = Number(e.target.value);
                      setNewProduct({...newProduct, stock, status: stock > 0 ? 'In Stock' : 'Out of Stock'});
                    }}
                    className="w-full border px-3 py-2 rounded"
                    min="0"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Image URL</label>
                  <input 
                    type="text" 
                    value={newProduct.image} 
                    onChange={e => setNewProduct({...newProduct, image: e.target.value})}
                    className="w-full border px-3 py-2 rounded"
                    placeholder="Optional image URL"
                  />
                </div>
              </div>
              
              <div className="flex justify-end space-x-2 mt-6">
                <button 
                  onClick={closeAddModal}
                  className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                >
                  Cancel
                </button>
                <button 
                  onClick={submitNewProduct}
                  className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                >
                  Add Product
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
