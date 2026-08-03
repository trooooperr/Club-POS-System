import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { X, Printer, Phone, Send, Check, Download, Share2 } from 'lucide-react';
import { apiUrl, authFetch } from '../lib/api';
import QRCode from 'qrcode';
const qz = typeof window !== 'undefined' ? window.qz : null;

export default function InvoiceModal() {
  const { invoiceOrder, setInvoiceOrder, settings, showToast, workers, role, deleteKOT, removeKOTItem, printBillDocument } = useApp();
  const [phone, setPhone] = useState(invoiceOrder?.customerPhone || '');
  const [sent, setSent] = useState(false);
  const [tab, setTab] = useState('whatsapp');

  if (!invoiceOrder) return null;
  const o = invoiceOrder;
  const s = settings;

  const waiterObj = (workers || []).find(w => w.name?.toLowerCase().trim() === o.waiterName?.toLowerCase().trim()) || null;

  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [waiterTipQrUrl, setWaiterTipQrUrl] = useState('');

  React.useEffect(() => {
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

  const handlePrint = async () => {
    try {
      await printBillDocument(
        o.tableNo,
        {
          items: o.items,
          subtotal: o.subtotal,
          sgst: o.sgst,
          cgst: o.cgst,
          discountAmount: o.discount || 0,
          roundOff: o.roundOff || 0,
          grandTotal: o.grandTotal
        },
        o.grandTotal,
        o.waiterName || '',
        o.billNo,
        waiterObj,
        o.paymentMode || 'cash',
        o.cashAmount || 0,
        o.upiAmount || 0,
        o.createdAt || o.date
      );
    } catch (err) {
      console.error(err);
      showToast('Failed to print bill', 'error');
    }
  };

const sendBill = () => {
  if (!phone || phone.length < 10) return;

  const itemsText = o.items
    .map(
      (item) =>
        `• ${item.name}  x${item.quantity}  = ${s.currency}${(
          item.price * item.quantity
        ).toFixed(0)}`
    )
    .join("\n");

  const message = `
*${s.restaurantName}*
${s.address}
GSTIN: ${s.gstin}

━━━━━━━━━━━━━━━━━━━━
*BILL: HTB-${(o.billNo || '').split('-').pop()}*
Table: ${o.tableNo}
${new Date(o.createdAt || o.date).toLocaleString("en-IN")}
━━━━━━━━━━━━━━━━━━━━

${itemsText}

━━━━━━━━━━━━━━━━━━━━
Subtotal: ${s.currency}${o.subtotal.toFixed(2)}
SGST (2.5%): ${s.currency}${o.sgst.toFixed(2)}
CGST (2.5%): ${s.currency}${o.cgst.toFixed(2)}
${
  o.discount > 0
    ? `Discount: -${s.currency}${o.discount.toFixed(2)}\n`
    : ""
} ${(o.roundOff || 0) !== 0 ? `Round Off: ${(o.roundOff > 0 ? '+' : '')}${o.roundOff.toFixed(2)}\n` : ""}

*TOTAL: ${s.currency}${Math.round(o.grandTotal)}*
━━━━━━━━━━━━━━━━━━━━

Paid via: ${o.paymentMode?.toUpperCase()}
${s.thankYouMsg}
`;

  const encoded = encodeURIComponent(message);

  window.open(`https://wa.me/91${phone}?text=${encoded}`, "_blank");

  setSent(true);
  setTimeout(() => setSent(false), 1000);
};



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
                <div className="bill-sub-info">{s.address}</div>
                <div className="bill-sub-info">GSTIN: {s.gstin}</div>
              </div>

              <div className="bill-zig-zag-sep"></div>

              <div className="bill-meta-grid">
                <div className="meta-item"><span>BILL NO</span><strong>HTB-{(o.billNo || '').split('-').pop()}</strong></div>
                <div className="meta-item" style={{textAlign:'right'}}><span>TABLE</span><strong>{o.tableNo}</strong></div>
                <div className="meta-item full-row"><span>DATE</span><strong>{new Date(o.date).toLocaleString()}</strong></div>
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
                <div className="sum-row"><span>SGST (2.5%)</span><span>{s.currency}{o.sgst.toFixed(2)}</span></div>
                <div className="sum-row"><span>CGST (2.5%)</span><span>{s.currency}{o.cgst.toFixed(2)}</span></div>
                {o.discount > 0 && <div className="sum-row discount"><span>Discount</span><span>-{s.currency}{o.discount.toFixed(2)}</span></div>}
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
                <strong>Note:</strong>  Contact us for parties or group gatherings
              </div>
            </div>
          </div>



          {/* SEND SECTION */}
          <div className="share-section-card">
            <div className="share-header"><Share2 size={12}/> SHARE INVOICE</div>
            <div className="tab-segment-control">
              <button className={`segment ${tab === 'whatsapp' ? 'active' : ''}`} onClick={() => setTab('whatsapp')}>WhatsApp</button>
              <button className={`segment ${tab === 'sms' ? 'active' : ''}`} onClick={() => setTab('sms')}>SMS</button>
            </div>
            
            <div className="share-input-row">
                <input maxLength={10} value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone Number" />
              <button className="send-circle-btn" onClick={sendBill} disabled={!phone || phone.length < 10}>
                {sent ? <Check size={12} /> : <Send size={18} />}
              </button>
            </div>
          </div>
        </div>

        {/* BOTTOM ACTION BAR - NEXT LEVEL ALIGNMENT */}
        <div className="inv-m-actions">
          <button className="btn-pill btn-minimal" onClick={() => setInvoiceOrder(null)}>CLOSE</button>
          <button className="btn-pill btn-outline-luxury" onClick={handlePrint}><Download size={16}/> PDF</button>
          <button className="btn-pill btn-primary-luxury" onClick={handlePrint}>
            <Printer size={16}/> PRINT BILL
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
        .bill-name-heavy { font-size: 13px; font-weight: 900; text-align: center; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 1px; }
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