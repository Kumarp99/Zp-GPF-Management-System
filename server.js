// server.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json()); // This is crucial for parsing JSON bodies
app.use(express.static(path.join(__dirname, 'public'))); // Serves your index.html

// A specific route for the root URL to serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize SQLite database
const db = new sqlite3.Database('./zp_gpf_database.db', (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the ZP GPF database.');
});

// Create tables if they don't exist
db.serialize(() => {
    // Employees table
    db.run(`CREATE TABLE IF NOT EXISTS employees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gpfAccountNo TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        designation TEXT,
        placeOfWork TEXT,
        mandal TEXT,
        financialYear TEXT,
        openingBalance INTEGER DEFAULT 0
    )`, (err) => {
        if (err) {
            console.error("Error creating employees table:", err.message);
        }
    });

    // Transactions table
    db.run(`CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employeeId INTEGER,
        month TEXT,
        ob INTEGER,
        subscription INTEGER DEFAULT 0,
        recovery INTEGER DEFAULT 0,
        loan INTEGER DEFAULT 0,
        cb INTEGER,
        FOREIGN KEY (employeeId) REFERENCES employees (id)
    )`, (err) => {
        if (err) {
            console.error("Error creating transactions table:", err.message);
        }
    });
});

// --- API Routes ---

// Get all employees
app.get('/api/employees', (req, res) => {
    db.all("SELECT * FROM employees", [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        const employeesWithTransactions = rows.map(employee => {
            return new Promise((resolve) => {
                db.all("SELECT * FROM transactions WHERE employeeId = ? ORDER BY rowid", [employee.id], (err, transactions) => {
                    if (err) {
                        console.error(err.message);
                        resolve({ ...employee, transactions: [] });
                    } else {
                        resolve({ ...employee, transactions: transactions || [] });
                    }
                });
            });
        });
        
        Promise.all(employeesWithTransactions).then(results => {
            res.json(results);
        });
    });
});

// Add a new employee
app.post('/api/employees', (req, res) => {
    console.log("POST request received at /api/employees");
    console.log("Request body (req.body):", req.body);

    const { gpfAccountNo, name, designation, placeOfWork, mandal, financialYear, openingBalance } = req.body;
    
    db.run(
        `INSERT INTO employees (gpfAccountNo, name, designation, placeOfWork, mandal, financialYear, openingBalance) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [gpfAccountNo, name, designation, placeOfWork, mandal, financialYear, openingBalance],
        function(err) {
            if (err) {
                console.error("Database error during INSERT:", err.message);
                res.status(500).json({ error: err.message });
                return;
            }
            
            console.log("Database INSERT successful. New ID:", this.lastID);
            res.status(201).json({ id: this.lastID });
        }
    );
});

// Delete an employee
app.delete('/api/employees/:id', (req, res) => {
    const { id } = req.params;
    
    db.run("DELETE FROM transactions WHERE employeeId = ?", [id], (err) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        db.run("DELETE FROM employees WHERE id = ?", [id], function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            
            res.json({ message: "Employee deleted successfully" });
        });
    });
});

// Save transactions for an employee
app.post('/api/employees/:id/transactions', (req, res) => {
    const { id } = req.params;
    const { transactions } = req.body;
    
    db.run("DELETE FROM transactions WHERE employeeId = ?", [id], (err) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        const stmt = db.prepare("INSERT INTO transactions (employeeId, month, ob, subscription, recovery, loan, cb) VALUES (?, ?, ?, ?, ?, ?, ?)");
        
        transactions.forEach(transaction => {
            stmt.run([
                id,
                transaction.month,
                transaction.ob,
                transaction.subscription,
                transaction.recovery,
                transaction.loan,
                transaction.cb
            ]);
        });
        
        stmt.finalize((err) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            
            res.json({ message: "Transactions updated successfully" });
        });
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`ZP GPF Management System server running on http://localhost:${PORT}`);
});