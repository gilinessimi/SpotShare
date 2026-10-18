const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const xss = require('xss'); // אבטחה: מניעת מתקפות XSS

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// 1. חיבור למסד נתונים SQLite (נוצר קובץ מקומי spotshare.db)
const db = new sqlite3.Database('./spotshare.db', (err) => {
  if (err) console.error("שגיאה בהתחברות למסד הנתונים:", err);
  else console.log("מחובר למסד נתונים SQLite.");
});

// 2. אתחול הטבלה והנתונים במקרה שזה פעם ראשונה שרצים
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS spots (
    id INTEGER PRIMARY KEY,
    name TEXT,
    status TEXT
  )`);

  db.get("SELECT COUNT(*) AS count FROM spots", (err, row) => {
    if (row && row.count === 0) {
      const stmt = db.prepare("INSERT INTO spots (id, name, status) VALUES (?, ?, ?)");
      stmt.run(1, 'חניה 1', 'free');
      stmt.run(2, 'חניה 2', 'free');
      stmt.run(3, 'חניה 3', 'free');
      stmt.run(4, 'חניה 4', 'free');
      stmt.finalize();
      console.log("נוצרו נתוני חניות ראשוניים ב-DB.");
    }
  });
});

io.on('connection', (socket) => {
  // קריאה ממסד הנתונים בעת התחברות
  db.all("SELECT * FROM spots", (err, rows) => {
    if (!err) socket.emit('initSpots', rows);
  });

  // עדכון מסד הנתונים כאשר לוחצים על חניה
  socket.on('toggleSpot', (id) => {
    db.get("SELECT status FROM spots WHERE id = ?", [id], (err, row) => {
      if (row) {
        const newStatus = row.status === 'free' ? 'taken' : 'free';
        db.run("UPDATE spots SET status = ? WHERE id = ?", [newStatus, id], () => {
          // לאחר העדכון, נשלוף מחדש ונשדר את המצב המעודכן לכולם
          db.all("SELECT * FROM spots", (err, updatedRows) => {
            if (!err) io.emit('updateSpots', updatedRows);
          });
        });
      }
    });
  });

  // צ'אט גלובלי עם סניטיזציה (אבטחה)
  socket.on('chatMessage', (msg) => {
    // מנקה את ההודעה כדי למנוע הזרקת סקריפטים ומתקפות XSS
    const sanitizedMsg = xss(msg);
    io.emit('chatMessage', { id: Date.now(), text: sanitizedMsg, sender: socket.id });
  });

  // איתות WebRTC
  socket.on('webrtc_offer', (data) => socket.broadcast.emit('webrtc_offer', data));
  socket.on('webrtc_answer', (data) => socket.broadcast.emit('webrtc_answer', data));
  socket.on('webrtc_ice_candidate', (data) => socket.broadcast.emit('webrtc_ice_candidate', data));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});