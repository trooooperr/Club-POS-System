import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { X, Printer, Download } from 'lucide-react';
import { apiUrl, authFetch } from '../lib/api';
import { formatBillDateTime } from '../lib/formatDate';
import QRCode from 'qrcode';
const qz = typeof window !== 'undefined' ? window.qz : null;

export default function InvoiceModal() {
  const { invoiceOrder, setInvoiceOrder, settings, showToast, workers, role, deleteKOT, removeKOTItem, printBillDocument, loadData, setActiveSection, selectTable, setTableBills } = useApp();

  if (!invoiceOrder) return null;
  const o = invoiceOrder;
  const s = settings;

  const waiterObj = (workers || []).find(w => w.name?.toLowerCase().trim() === o.waiterName?.toLowerCase().trim()) || null;

  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [waiterTipQrUrl, setWaiterTipQrUrl] = useState('');

  useEffect(() => {
    if (!o) return;
    const generateQRs = async () => {
      try {
        const roundedGrandTotal = Math.round(o.grandTotal);
        const upiId = s.upiId || 'dummy@upi';
        const merchantName = s.restaurantName || 'HUMTUM';
        const includeAmount = s.includeUpiAmount !== false;
        const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(merchantName)}${includeAmount ? `&am=${roundedGrandTotal}` : ''}&cu=INR`;
        
        const qr = await QRCode.toDataURL(upiUrl, { margin: 1, width: 250 });
        setQrCodeUrl(qr);

        if (waiterObj?.upiId) {
          const waiterUpiUrl = `upi://pay?pa=${encodeURIComponent(waiterObj.upiId)}&pn=${encodeURIComponent(waiterObj.name)}&cu=INR`;
          const tipQr = await QRCode.toDataURL(waiterUpiUrl, { margin: 1, width: 200 });
          setWaiterTipQrUrl(tipQr);
        } else {
          setWaiterTipQrUrl('');
        }
      } catch (err) {
        console.error('Failed to generate local QRs:', err);
      }
    };
    generateQRs();
  }, [o, s, waiterObj]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setInvoiceOrder(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setInvoiceOrder]);

  const billDate = o.date || o.createdAt || new Date();
  const formattedDate = formatBillDateTime(billDate);
  const gstRate = s.gstRate !== undefined ? s.gstRate : Number(((s.cgstRate || 0) + (s.sgstRate || 0)).toFixed(2));
  const gst = typeof o.gst === 'number' ? o.gst : Number(((o.cgst || 0) + (o.sgst || 0)).toFixed(2));
  const totalBeforeDiscount = Number(((o.subtotal || 0) + gst + (o.serviceTax || 0)).toFixed(2));
  const discountVal = typeof o.discount === 'number' ? o.discount : (parseFloat(o.discount) || 0);
  let discountPercent = 0;
  if ((o.grandTotal !== undefined && o.grandTotal <= 1) && discountVal > 0) {
    discountPercent = 100;
  } else if (o.discountPercent !== undefined && o.discountPercent !== null && !isNaN(parseFloat(o.discountPercent)) && parseFloat(o.discountPercent) > 0) {
    discountPercent = Math.min(100, Math.round(parseFloat(o.discountPercent)));
  } else if (discountVal > 0) {
    if (totalBeforeDiscount > 0) {
      discountPercent = Math.min(100, Math.round((discountVal / totalBeforeDiscount) * 100));
    } else if ((o.subtotal || 0) > 0) {
      const base = ((o.grandTotal || 0) + discountVal) || o.subtotal;
      discountPercent = Math.min(100, Math.round((discountVal / base) * 100));
    }
  }
  discountPercent = Math.min(100, Math.max(0, discountPercent));

  const handlePrint = async () => {
    try {
      await printBillDocument(
        o.tableNo,
        {
          items: o.items,
          subtotal: o.subtotal,
          gst,
          gstRate,
          sgst: o.sgst,
          cgst: o.cgst,
          serviceTax: o.serviceTax || 0,
          discountAmount: discountVal,
          discountPercent,
          fine: o.fine || 0,
          roundOff: o.roundOff || 0,
          grandTotal: o.grandTotal,
          date: billDate,
          customerPhone: o.customerPhone || '',
          customerName: o.customerName || ''
        },
        o.grandTotal,
        o.waiterName || '',
        o.billNo,
        waiterObj,
        o.paymentMode || 'cash',
        o.cashAmount || 0,
        o.upiAmount || 0,
        billDate
      );
    } catch (err) {
      console.error(err);
      showToast('Failed to print bill', 'error');
    }
  };

  const stRate = o.serviceTaxRate || (s.serviceTaxRate > 0 ? s.serviceTaxRate : ((o.subtotal || 0) > 0 && (o.serviceTax || 0) > 0 ? parseFloat(((o.serviceTax / o.subtotal) * 100).toFixed(1)) : 5));

  return (
    <div className="moverlay">
      <div className="mbox invoice-premium-modal">
        {/* TOP HEADER */}
        <div className="inv-m-header">
          <div className="header-left">
            <div className="live-dot"></div>
            <span className="header-status">ORDER HTB-{(o.billNo || '').split('-').pop()}</span>
          </div>
          <button className="close-btn-minimal" onClick={() => setInvoiceOrder(null)}><X size={20}/></button>
        </div>

        <div className="inv-m-body">
          {/* THE REALISTIC BILL CARD */}
          <div className="bill-paper-wrap" id="printable-bill-area">
            <div className="bill-inner">
              <div className="bill-top-center">
                <div className="bill-name-heavy">{s.restaurantName}</div>
                {s.address && <div className="bill-sub-info">{s.address}</div>}
                {(s.phone || s.contact) && <div className="bill-sub-info">Contact: {s.phone || s.contact}</div>}
                {s.gstin && <div className="bill-sub-info">GSTIN: {s.gstin}</div>}
              </div>

              <div className="bill-zig-zag-sep"></div>

              <div className="bill-meta-grid">
                <div className="meta-item"><span>BILL NO</span><strong>HTB-{(o.billNo || '').split('-').pop()}</strong></div>
                <div className="meta-item" style={{textAlign:'right'}}><span>TABLE</span><strong>{o.tableNo}</strong></div>
                <div className="meta-item full-row"><span>DATE</span><strong>{formattedDate}</strong></div>
                {o.waiterName && <div className="meta-item full-row"><span>WAITER</span><strong>{o.waiterName.toUpperCase()}</strong></div>}
              </div>

              <div className="bill-zig-zag-sep"></div>

              <table className="bill-items-table">
                <thead>
                  <tr>
                    <th align="left">ITEM</th>
                    <th align="center">QTY</th>
                    <th align="right">TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {o.items.map((item, i) => (
                    <tr key={i}>
                      <td className="item-name-bold">{item.name}</td>
                      <td align="center">x{item.quantity}</td>
                      <td align="right">{s.currency}{(item.price * item.quantity).toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="bill-zig-zag-sep"></div>

              <div className="bill-summary-stack">
                <div className="sum-row"><span>Subtotal</span><span>{s.currency}{o.subtotal.toFixed(2)}</span></div>
                {gst > 0 && <div className="sum-row"><span>GST ({gstRate}%)</span><span>{s.currency}{gst.toFixed(2)}</span></div>}
                {(o.serviceTax || 0) > 0 && <div className="sum-row"><span>Service Tax ({stRate}%)</span><span>{s.currency}{o.serviceTax.toFixed(2)}</span></div>}
                <div className="sum-row" style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '4px', marginTop: '2px', fontWeight: 'bold' }}>
                  <span>Total</span><span>{s.currency}{totalBeforeDiscount.toFixed(2)}</span>
                </div>
                {discountVal > 0 && <div className="sum-row discount"><span>Discount ({discountPercent}%)</span><span>-{s.currency}{discountVal.toFixed(2)}</span></div>}
                {(o.fine || 0) > 0 && <div className="sum-row" style={{ color: '#ef4444', fontWeight: 700 }}><span>Fine</span><span>+{s.currency}{o.fine.toFixed(2)}</span></div>}
                {(o.roundOff || 0) !== 0 && <div className="sum-row"> <span>Round-Off</span><span>{o.roundOff > 0 ? '+' : ''}{o.roundOff.toFixed(2)}</span></div>}
                <div className="grand-total-box">
                  <div className="grand-label">AMOUNT PAYABLE</div>
                  <div className="grand-value">{s.currency}{o.grandTotal.toFixed(2)}</div>
                </div>

                {o.dueAmount > 0 && <div className="sum-row due-row"><span>DUE AMOUNT</span><span>{s.currency}{o.dueAmount.toFixed(2)}</span></div>}
              </div>

              {/* QR Code on screen */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '12px 0' }}>
                <div style={{ fontSize: 11, fontWeight: 'bold', color: '#1e293b', marginBottom: 4 }}>SCAN TO PAY</div>
                <img src={qrCodeUrl} alt="QR Code" style={{ width: 110, height: 110 }} />
                {waiterTipQrUrl && (
                  <>
                    <div style={{ borderTop: '1px dashed #cbd5e1', width: '100%', margin: '12px 0 8px 0' }}></div>
                    <div style={{ fontSize: 11, fontWeight: 'bold', color: '#1e293b', marginBottom: 2 }}>TIP WAITER</div>
                    <div style={{ fontSize: 9, color: '#64748b', marginBottom: 4 }}>Scan to tip {waiterObj?.name?.toUpperCase()}</div>
                    <img src={waiterTipQrUrl} alt="Tip QR Code" style={{ width: 90, height: 90 }} />
                  </>
                )}
              </div>

              <div className="bill-footer-note">
                {o.paymentMode?.toUpperCase()} · THANK YOU FOR VISITING!
                <br />
                <strong>Note:</strong> Contact us for parties & group gatherings{(s.phone || s.contact) ? `: ${s.phone || s.contact}` : ''}
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM ACTION BAR - NEXT LEVEL ALIGNMENT */}
        <div className="inv-m-actions" style={{ gridTemplateColumns: '0.8fr 1fr 1fr 1.2fr' }}>
          <button className="btn-pill btn-minimal" onClick={() => setInvoiceOrder(null)}>CLOSE</button>
          <button
            className="btn-pill btn-outline-luxury"
            style={{ borderColor: 'rgba(245, 158, 11, 0.4)', color: 'var(--a)' }}
            onClick={async () => {
              try {
                const res = await authFetch(apiUrl(`/api/orders/reopen-bill/${o._id}`), { method: 'POST' });
                if (!res.ok) {
                  showToast('Failed to re-open bill', 'amber');
                  return;
                }
                const data = await res.json();
                const order = data.order;
                const tableNo = order?.tableNo;
                const targetTableId = `t${tableNo}`;

                if (setTableBills && order) {
                  const mappedItems = (order.items || []).map(i => ({
                    _id: i.menuItemId?._id || i.menuItemId || i._id,
                    name: i.name,
                    quantity: i.quantity,
                    price: i.price,
                    department: i.department || 'kitchen',
                    note: i.notes || i.note || ''
                  }));

                  let discountPctStr = '';
                  if (order.grandTotal <= 1 && (order.discount || 0) > 0) {
                    discountPctStr = '100';
                  } else if (order.discountPercent !== undefined && order.discountPercent !== null && order.discountPercent > 0) {
                    discountPctStr = String(Math.min(100, Math.round(order.discountPercent)));
                  } else if (order.discount) {
                    const totalBeforeDisc = (order.subtotal || 0) + (order.sgst || 0) + (order.cgst || 0) + (order.serviceTax || 0);
                    const base = totalBeforeDisc > 0 ? totalBeforeDisc : (order.subtotal || 0);
                    discountPctStr = base > 0 ? String(Math.min(100, Math.round((order.discount / base) * 100))) : '';
                  }

                  const hasServiceTax = (order.serviceTax && order.serviceTax > 0) || (order.serviceTaxRate && order.serviceTaxRate > 0);
                  const orderServiceTaxRate = order.serviceTaxRate > 0 
                    ? order.serviceTaxRate 
                    : (order.subtotal > 0 && order.serviceTax > 0 ? Number(((order.serviceTax / order.subtotal) * 100).toFixed(2)) : 0);

                  setTableBills(prev => ({
                    ...prev,
                    [targetTableId]: {
                      items: mappedItems,
                      customerName: order.customerName || '',
                      customerPhone: order.customerPhone || '',
                      discount: discountPctStr,
                      isCreditPay: order.isCredit || false,
                      paidAmount: order.paidAmount !== undefined ? String(order.paidAmount) : '',
                      serviceTaxEnabled: hasServiceTax,
                      serviceTaxRate: orderServiceTaxRate
                    }
                  }));
                }

                showToast(`Bill ${o.billNo} re-opened for editing on Table ${tableNo}!`, 'green');
                setInvoiceOrder(null);
                if (loadData) await loadData();
                if (setActiveSection) setActiveSection('billing');
                if (selectTable) selectTable(tableNo);
              } catch (err) {
                showToast('Error re-opening bill', 'amber');
              }
            }}
          >
            EDIT
          </button>
          <button className="btn-pill btn-outline-luxury" onClick={handlePrint}><Download size={16}/> PDF</button>
          <button className="btn-pill btn-primary-luxury" onClick={handlePrint}>
            <Printer size={16}/> PRINT
          </button>
        </div>
      </div>

      <style>{`
        .invoice-premium-modal {
          width: 95%; max-width: 340px; height: auto; max-height: 94vh; 
          display: flex; flex-direction: column; background: #0c0e12; 
          border: 1px solid #232830; border-radius: 20px; padding: 0 !important; overflow: hidden;
          box-shadow: 0 20px 50px rgba(0,0,0,0.6);
        }

        .inv-m-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #1c2026; }
        .header-left { display: flex; align-items: center; gap: 8px; }
        .live-dot { width: 6px; height: 6px; background: #22c55e; border-radius: 50%; box-shadow: 0 0 8px #22c55e; }
        .header-status { color: #8a94a6; font-size: 10px; font-weight: 800; letter-spacing: 1.5px; }
        .close-btn-minimal { background: none; border: none; color: #64748b; cursor: pointer; transition: color 0.15s; }
        .close-btn-minimal:hover { color: #f43f5e; }

        .inv-m-body { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 12px; }

        /* Modern Receipt Look - Smaller & Polished */
        .bill-paper-wrap { 
          background: #ffffff; border-radius: 8px; padding: 2px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.25);
        }
        .bill-inner { border: 1px dashed #e2e8f0; border-radius: 6px; padding: 12px; color: #1e293b; font-family: 'Courier New', Courier, monospace; }
        .bill-name-heavy { font-size: 18px; font-weight: 900; text-align: center; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
        .bill-sub-info { font-size: 10px; text-align: center; color: #64748b; text-transform: uppercase; margin-bottom: 1px; line-height: 1.3; }
        .bill-zig-zag-sep { border-top: 1px dashed #cbd5e1; margin: 8px 0; }
        
        .bill-meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11px; }
        .meta-item span { display: block; color: #94a3b8; font-size: 9px; font-weight: bold; margin-bottom: 1px; }
        .meta-item strong { color: #334155; }
        .full-row { grid-column: span 2; }

        .bill-items-table { width: 100%; border-collapse: collapse; margin: 4px 0; font-size: 11px; }
        .bill-items-table th { border-bottom: 1px solid #475569; padding-bottom: 2px; font-size: 10px; color: #64748b; font-weight: 900; }
        .bill-items-table td { padding: 1px 0; color: #334155; }
        .item-name-bold { font-weight: 700; text-transform: uppercase; }

        .bill-summary-stack { display: flex; flex-direction: column; gap: 1px; }
        .sum-row { display: flex; justify-content: space-between; font-size: 11px; color: #475569; margin-bottom: 1px; }
        .discount { color: #dc2626; font-weight: bold; }
        
        .grand-total-box { 
          display: flex; justify-content: space-between; align-items: center;
          margin: 2px 0; padding: 4px 6px; background: #f8fafc; border-radius: 4px; 
          border: 1px solid #e2e8f0;
        }
        .grand-label { font-size: 11px; font-weight: 800; color: #64748b; letter-spacing: 0.2px; }
        .grand-value { font-size: 14px; font-weight: 900; color: #0f172a; }
        
        .due-row { color: #dc2626; font-weight: 900; font-size: 12px; margin-top: 2px; }
        .paid-row { border-top: 1px dashed #e2e8f0; padding-top: 4px; margin-top: 2px; }
        .bill-footer-note { text-align: center; font-size: 9px; margin-top: 4px; color: #94a3b8; font-weight: bold; text-transform: uppercase; }

        /* Share Control Styling */
        .share-section-card { background: #161b22; border-radius: 14px; padding: 8px; border: 1px solid #232830; }
        .share-header { font-size: 9px; font-weight: 900; color: #4b5563; margin-bottom: 8px; letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px; }
        
        .tab-segment-control { display: flex; background: #0d1117; padding: 3px; border-radius: 8px; margin-bottom: 8px; }
        .segment { flex: 1; border: none; background: none; color: #8b949e; padding: 6px; font-size: 10px; font-weight: 800; border-radius: 6px; cursor: pointer; transition: all 0.2s; }
        .segment.active { background: #f59e0b; color: #000; font-weight: 900; }

        .share-input-row { display: flex; gap: 8px; }
        .share-input-row input { flex: 1; background: #0d1117; border: 1px solid #21262d; border-radius: 8px; color: #c9d1d9; font-size: 12px; outline: none; padding: 0 10px; height: 32px; }
        .share-input-row input::placeholder { color: #484f58; }
        .send-circle-btn { background: #238636; color: #fff; width: 40px; height: 32px; border-radius: 8px; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.15s; }
        .send-circle-btn:hover { background: #2ea043; }

        /* BOTTOM FLOATING ACTION BAR */
        .inv-m-actions { 
          display: grid; grid-template-columns: 0.8fr 0.8fr 1.4fr; gap: 8px; 
          padding: 10px 12px 18px; background: #0c0e12; border-top: 1px solid #1c2026;
        }
        .btn-pill { 
          height: 38px; border-radius: 10px; font-weight: 900; font-size: 10px; 
          display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; border: none;
          transition: transform 0.1s, opacity 0.15s;
        }
        .btn-pill:active { transform: scale(0.97); }
        .btn-minimal { background: #21262d; color: #c9d1d9; }
        .btn-minimal:hover { background: #30363d; }
        .btn-outline-luxury { background: transparent; border: 1px solid #30363d; color: #c9d1d9; }
        .btn-outline-luxury:hover { background: #161b22; }
        .btn-primary-luxury { background: #f59e0b; color: #000; }
        .btn-primary-luxury:hover { opacity: 0.95; }

        @media (max-width: 320px) {
          .btn-pill { font-size: 9px; padding: 0 4px; }
          .grand-value { font-size: 15px; }
        }
      `}</style>
    </div>
  );
}