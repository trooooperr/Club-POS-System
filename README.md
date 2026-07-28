# Club POS System (V2.0 — Production ERP)

A **premium, enterprise POS & Inventory System** engineered specifically for **Club POS Operations**.  
Features **atomic bill numbering, real-time stock deduction, silent thermal desktop printing**, and **role-secured API protection**.

---

<p align="center">
  <img width="48%" alt="Table Management" src="https://github.com/user-attachments/assets/ae20b048-35cd-4558-b7f4-bff125f011c5" />
  <img width="48%" src="https://github.com/user-attachments/assets/568310af-b824-44fa-9786-b6aa041de85c" alt="Billing Dashboard" />
  <img width="48%" src="https://github.com/user-attachments/assets/a4599772-bdae-4d87-ae7f-cdd024de8547" alt="order history"/>
  <img width="48%" src="https://github.com/user-attachments/assets/621d111b-0233-4059-b4a9-59750787e537" alt="Inventory Management"/>
</p>

---

## ⚡ Quick Demo & Credentials

### 1. Local One-Command Startup
```bash
npm install
cd frontend && npm install && cd ..
npm run dev
```

### 2. Demo User Accounts
| Role | Username | Password | Permissions & Access Level |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin` | `admin123` | Full Access: Settings, User Management, Cache Clear |
| **Manager** | `manager` | `manager123` | Operational Access: Inventory, Workers, Sales Reports |
| **Staff** | `staff` | `staff123` | POS Operations: Billing & KOT Creation |

### 3. Zero-Setup Automated Audit (`npm test`)
```bash
npm test  # Executes all 56 automated test cases in ~6 seconds
```

---

## 🏗️ System Architecture

```mermaid
graph LR
    subgraph Devices [1. Client Devices]
        PHONE["📱 Customer Phone"]
        POS["💻 Cashier / Waiter POS"]
    end

    subgraph Server [2. ERP Backend]
        API["⚙️ Express API"]
        BILL["🧾 Billing & Tax Engine"]
        STOCK["📦 Inventory Engine"]
    end

    subgraph Hardware [3. Silent Printing & Data]
        PRINT["🖨️ Silent Desktop Print Agent"]
        PRINTERS["🖨️ Kitchen & Cashier Thermal Printers"]
        DB[("🗄️ MongoDB & Redis")]
    end

    PHONE --> API
    POS --> API
    API --> BILL & STOCK
    POS --> PRINT
    PRINT --> PRINTERS
    API --> DB
```

---

## 🔄 End-to-End Workflow & Dataflow

### 1. Customer-to-Cashier Process Flow

```mermaid
flowchart TD
    A["📱 Customer Phone / Waiter POS"] -->|1. Place Club Order| B["⚙️ Express Backend API"]
    B -->|2. Check & Deduct Inventory Stock| C[("🗄️ Bar Inventory")]
    B -->|3. Send KOT HTML Payload| D["🖨️ Silent Desktop Print Agent"]
    D -->|4. Silent Print KOT Ticket| E["🖨️ Kitchen Thermal Printer"]
    
    E -->|5. Kitchen Prepares & Serves Food| F["💻 Cashier POS Terminal"]
    F -->|6. Settle Bill & Tax| G["⚡ Redis Atomic Bill #"]
    G -->|7. Deduct Delta Stock| C
    G -->|8. Silent Print Customer Receipt| H["🖨️ Cashier Thermal Printer"]
    G -->|9. Sync Final Data| I["📈 Sales & Stock Reports"]
```

### 2. Order Settlement Sequence Dataflow

```mermaid
sequenceDiagram
    autonumber
    actor Customer as 📱 Customer / Waiter
    actor Cashier as 💻 Cashier Terminal
    participant Server as ⚙️ Express Backend
    participant PrintAgent as 🖨️ Silent Print Agent
    participant Printer as 🖨️ Kitchen & Cashier Printers
    participant DB as 🗄️ Database & Redis

    Customer->>Server: 1. Place Order (POST /api/kots)
    Server->>DB: 2. Check & Deduct Inventory Stock
    Server->>PrintAgent: 3. Send KOT HTML Payload (Port 5001)
    PrintAgent->>Printer: 4. Silent Print KOT Ticket in Kitchen
    
    Note over Customer, Cashier: Kitchen Prepares Food & Serves Customer
    
    Customer->>Cashier: 5. Request Final Bill
    Cashier->>Server: 6. Settle Order (POST /api/orders/settle)
    Server->>DB: 7. Fetch Atomic Bill # (Redis) & Deduct Delta Stock
    Server->>PrintAgent: 8. Send Thermal Receipt HTML Payload
    PrintAgent->>Printer: 9. Silent Print Customer Receipt at Cashier
    Server->>DB: 10. Update Sales & Stock Reports (MongoDB)
```

---

## 🚀 Key Features

1. **Decoupled Menu & Inventory:** Kitchen items bypass stock tracking for zero billing latency; Inventory items track stock levels in real time..
2. **Delta Stock Protection:** Deducts inventory during KOT creation and only deducts newly added items upon final bill printing to prevent double-deduction.
3. **Atomic Bill Numbering:** Resilient daily sequential bill counter powered by Redis `INCR`.
4. **Direct Kitchen Silent Printing:** Local agent running on port `5001` that spools PDFs silently to Kitchen & Cashier ESC/POS thermal printers.

---

## 🔒 Security & Role-Based Access Control (RBAC)

```mermaid
graph LR
    Request[Incoming API Call] --> JWT{Valid JWT?}
    JWT -- No --> Deny[401 Unauthorized]
    JWT -- Yes --> Role{Check User Role}
    
    Role -- Staff L1 --> StaffLimit[POS & KOT Access Only]
    Role -- Manager L2 --> MgrLimit[Inventory & Reports Access]
    Role -- Admin L3 --> FullAccess[Full System Control]
```

---

## 🧪 Automated Testing (`56/56 Passed`)

```
PASS  src/test/rigorous_pos_audit.test.js (24 tests)
PASS  src/test/orders.test.js              (6 tests)
PASS  src/test/tough_audit.test.js         (5 tests)
PASS  src/test/kots_management.test.js      (4 tests)
PASS  src/test/inventoryReport.test.js     (4 tests)
PASS  src/test/cors.test.js                (4 tests)
PASS  src/test/settings.test.js            (2 tests)
PASS  src/test/menu.test.js                (2 tests)
PASS  src/test/auth.test.js                (2 tests)
PASS  src/test/health.test.js              (1 test)
```

---

## 🛠️ Tech Stack & Installation

- **Frontend:** React 18, Vite, Tailwind CSS, Socket.IO Client
- **Backend:** Node.js, Express 4, Socket.IO, Mongoose
- **Database & Cache:** MongoDB Atlas, Upstash Redis
- **Silent Printing:** Silent Desktop Print Agent (Port 5001 + SumatraPDF)

```bash
# Backend Server Setup
npm install && npm run dev

# Frontend App Setup
cd frontend && npm install && npm run dev

# Silent Print Agent Setup (Client PC)
cd print-agent && npm install && npm start
```

---

## License

Built for **Club & Restaurant POS ERP**. All rights reserved.
