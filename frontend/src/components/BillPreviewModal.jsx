              import React, { useState } from 'react';
import { X, Share2, MessageCircle, Download, Printer } from 'lucide-react';

export default function BillPreviewModal({ bill, table, tableNo, settings, onClose, onPrint }) {
  const [customerPhone, setCustomerPhone] = useState(table?.customerPhone || '');
  const [paidAmount] = useState(bill?.totalAmount || 0);
  const [paymentMode] = useState(bill?.paymentMode || 'CASH');

  const handlePrint = () => {
    if (onPrint) {
      onPrint({ customerPhone });
    }
  };

  const handleWhatsApp = () => {
    if (!customerPhone || customerPhone.length < 10) {
      alert('Please enter a valid customer phone number');
      return;
    }
    const message = `Thank you for visiting ${settings.restaurantName || 'HumTum'}! Your bill for Table T${tableNo} is ₹${bill?.totalAmount?.toFixed(0)}. We hope to see you again soon!`;
    window.open(`https://wa.me/91${customerPhone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleSMS = () => {
    if (!customerPhone || customerPhone.length < 10) {
      alert('Please enter a valid customer phone number');
      return;
    }
    const message = `Thank you for visiting ${settings.restaurantName || 'HumTum'}! Bill: ₹${bill?.totalAmount?.toFixed(0)}. Feedback: ${window.location.origin}/feedback?table=T${tableNo}`;
    window.location.href = `sms:${customerPhone}?body=${encodeURIComponent(message)}`;
  };

  return (
    <div className="moverlay" style={{ background: 'rgba(0,0,0,0.7)', zIndex: 1000 }}>
      <div className="modal-container" style={{ maxWidth: '500px', maxHeight: '90vh', overflow: 'auto', borderRadius: 12 }}>
        {/* Close button */}
        <button className="modal-close-btn" onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}>
          <X size={20} />
        </button>

        {/* Order status */}
        <div style={{ padding: '12px 20px', background: 'var(--s2)', borderBottom: '1px solid var(--b1)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981' }}></div>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)' }}>ORDER {bill?.billNo || 'HTB-000'}</span>
        </div>

        {/* Invoice Preview */}
        <div style={{ padding: '24px 20px', background: 'white', color: '#000' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: '1px' }}>{settings.restaurantName || 'HumTum'}</div>
            {settings.address && (
              <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>{settings.address}</div>
            )}
            {settings.phone && (
              <div style={{ fontSize: 11, color: '#666' }}>Ph: {settings.phone}</div>
            )}
            {settings.gstin && (
              <div style={{ fontSize: 11, color: '#666' }}>GSTIN: {settings.gstin}</div>
            )}
          </div>

          {/* Separator */}
          <div style={{ borderBottom: '1px dashed #999', margin: '12px 0' }}></div>

          {/* Bill Info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px', fontSize: 12, marginBottom: 12, color: '#666' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>BILL NO</div>
              <div style={{ fontSize: 14, fontWeight: 900, color: '#000' }}>{bill?.billNo || 'HTB-000'}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>TABLE</div>
              <div style={{ fontSize: 14, fontWeight: 900, color: '#000' }}>T{tableNo}</div>
            </div>
          </div>

          <div style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>DATE</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#000' }}>
              {new Date().toLocaleDateString()}, {new Date().toLocaleTimeString()}
            </div>
          </div>

          {/* Separator */}
          <div style={{ borderBottom: '1px dashed #999', margin: '12px 0' }}></div>

          {/* Items */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '8px 12px', fontSize: 11, fontWeight: 600, borderBottom: '1px solid #000', paddingBottom: 6, marginBottom: 8 }}>
              <div style={{ textTransform: 'uppercase' }}>ITEM</div>
              <div style={{ textAlign: 'center', textTransform: 'uppercase' }}>QTY</div>
              <div style={{ textAlign: 'right', textTransform: 'uppercase' }}>PRICE</div>
            </div>
            {table?.items?.map((item, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '8px 12px', fontSize: 12, marginBottom: 6 }}>
                <div style={{ fontWeight: 600 }}>{item.name}</div>
                <div style={{ textAlign: 'center', fontWeight: 700 }}>x{item.quantity}</div>
                <div style={{ textAlign: 'right', fontWeight: 700 }}>₹{(item.price * item.quantity).toFixed(0)}</div>
              </div>
            ))}
          </div>

          {/* Separator */}
          <div style={{ borderBottom: '1px dashed #999', margin: '12px 0' }}></div>

          {/* Totals */}
          <div style={{ fontSize: 12, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, color: '#666' }}>
              <span>Subtotal</span>
              <span>₹{bill?.subtotal?.toFixed(2) || '0.00'}</span>
            </div>
            {bill?.tax1 > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, color: '#666' }}>
                <span>SGST (2.5%)</span>
                <span>₹{bill?.tax1?.toFixed(2) || '0.00'}</span>
              </div>
            )}
            {bill?.tax2 > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, color: '#666' }}>
                <span>CGST (2.5%)</span>
                <span>₹{bill?.tax2?.toFixed(2) || '0.00'}</span>
              </div>
            )}
            {bill?.roundOff !== 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, color: '#666' }}>
                <span>Round-Off</span>
                <span>{bill?.roundOff > 0 ? '+' : ''}₹{bill?.roundOff?.toFixed(2) || '0.00'}</span>
              </div>
            )}
          </div>

          {/* Amount Payable */}
          <div style={{ background: '#f3f4f6', padding: '12px 16px', borderRadius: 8, marginBottom: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: '#666', marginBottom: 4 }}>AMOUNT PAYABLE</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#000' }}>₹{bill?.totalAmount?.toFixed(0) || '0'}</div>
          </div>

          {/* Payment Info */}
          <div style={{ fontSize: 12, marginBottom: 16, textAlign: 'center' }}>
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: '#666' }}>Amount Paid</span>
              <div style={{ fontSize: 14, fontWeight: 700 }}>₹{paidAmount?.toFixed(0) || '0'}</div>
            </div>
            <div style={{ fontSize: 11, color: '#666', fontWeight: 600 }}>
              {paymentMode} · {settings.thankYouMsg || 'THANK YOU FOR VISITING!'}
            </div>
          </div>

          {/* QR Code & Footer */}
          {settings.phone && (
            <div style={{ fontSize: 11, color: '#666', textAlign: 'center', marginBottom: 12, fontWeight: 500 }}>
              {settings.phone}
            </div>
          )}

          {/* Separator */}
          <div style={{ borderBottom: '1px dashed #999', margin: '12px 0' }}></div>
        </div>

        {/* Customer Phone Section */}
        <div style={{ padding: '16px 20px', background: 'var(--s2)', borderBottom: '1px solid var(--b1)' }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--t1)' }}>
            Customer Phone (for WhatsApp/SMS)
          </label>
          <input
            type="tel"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
            placeholder="Enter 10-digit phone number"
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid var(--b1)',
              borderRadius: 6,
              fontSize: 14,
              background: 'var(--s1)',
              color: 'var(--t1)',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Action Buttons */}
        <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, background: 'var(--s2)' }}>
          <button
            className="btn btn-outline"
            onClick={onClose}
            style={{ fontSize: 13, fontWeight: 600 }}
          >
            <X size={16} /> Close
          </button>
          <button
            className="btn btn-primary"
            onClick={handlePrint}
            style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <Printer size={16} /> Print Bill
          </button>
        </div>

        {/* Share Options */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--b1)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button
            className="btn btn-primary"
            onClick={handleWhatsApp}
            style={{
              fontSize: 13,
              fontWeight: 600,
              background: '#25D366',
              color: 'white',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <Share2 size={16} /> WhatsApp
          </button>
          <button
            className="btn btn-outline"
            onClick={handleSMS}
            style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <MessageCircle size={16} /> SMS
          </button>
        </div>
      </div>
    </div>
  );
}
