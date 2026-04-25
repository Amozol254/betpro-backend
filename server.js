// BetPro Backend API
// Run with: node server.js
// Install packages first:
// npm init -y
// npm install express cors bcryptjs jsonwebtoken better-sqlite3

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');

const app = express();
const PORT = 5000;
const JWT_SECRET = 'change_this_secret_key_before_hosting';

app.use(cors());
app.use(express.json());

// Database
const db = new Database('betpro.db');

// Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    balance REAL DEFAULT 5000,
    role TEXT DEFAULT 'user',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    league TEXT NOT NULL,
    home_team TEXT NOT NULL,
    away_team TEXT NOT NULL,
    sport TEXT NOT NULL,
    status TEXT DEFAULT 'upcoming',
    match_time TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS odds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL,
    pick TEXT NOT NULL,
    odd REAL NOT NULL,
    FOREIGN KEY(match_id) REFERENCES matches(id)
  );

  CREATE TABLE IF NOT EXISTS bets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    stake REAL NOT NULL,
    total_odds REAL NOT NULL,
    potential_win REAL NOT NULL,
    status TEXT DEFAULT 'pending',
    selections TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

// Seed sample matches once
const matchCount = db.prepare('SELECT COUNT(*) AS count FROM matches').get().count;

if (matchCount === 0) {
  const insertMatch = db.prepare(`
    INSERT INTO matches (league, home_team, away_team, sport, status, match_time)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertOdd = db.prepare(`
    INSERT INTO odds (match_id, pick, odd)
    VALUES (?, ?, ?)
  `);

  const sampleMatches = [
    {
      league: 'Premier League', home: 'Arsenal', away: 'Chelsea', sport: 'football', status: 'upcoming', time: 'Today 8:00 PM',
      odds: [['Arsenal Win', 1.85], ['Draw', 3.20], ['Chelsea Win', 4.10]]
    },
    {
      league: 'La Liga', home: 'Barcelona', away: 'Sevilla', sport: 'football', status: 'upcoming', time: 'Tomorrow 9:30 PM',
      odds: [['Barcelona Win', 1.55], ['Draw', 4.00], ['Sevilla Win', 5.70]]
    },
    {
      league: 'Tennis', home: 'Nadal', away: 'Djokovic', sport: 'tennis', status: 'upcoming', time: 'Tomorrow 5:00 PM',
      odds: [['Nadal Win', 2.15], ['Over 3.5 Sets', 1.75], ['Djokovic Win', 1.68]]
    },
    {
      league: 'Live Basketball', home: 'Lakers', away: 'Celtics', sport: 'basketball', status: 'live', time: '3rd Quarter',
      odds: [['Lakers Win', 1.95], ['Over 180.5', 1.88], ['Celtics Win', 2.05]]
    }
  ];

  for (const game of sampleMatches) {
    const result = insertMatch.run(game.league, game.home, game.away, game.sport, game.status, game.time);
    for (const odd of game.odds) {
      insertOdd.run(result.lastInsertRowid, odd[0], odd[1]);
    }
  }
}

// Middleware
function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const token = header.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

// Health check
app.get('/', (req, res) => {
  res.json({ message: 'BetPro API is running' });
});

// Register
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);

  try {
    const result = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, hashedPassword);
    res.json({ message: 'Account created successfully', userId: result.lastInsertRowid });
  } catch (error) {
    res.status(400).json({ message: 'Username already exists' });
  }
});

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user) {
    return res.status(401).json({ message: 'Invalid username or password' });
  }

  const validPassword = bcrypt.compareSync(password, user.password);

  if (!validPassword) {
    return res.status(401).json({ message: 'Invalid username or password' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    message: 'Login successful',
    token,
    user: {
      id: user.id,
      username: user.username,
      balance: user.balance,
      role: user.role
    }
  });
});

// User profile
app.get('/api/me', auth, (req, res) => {
  const user = db.prepare('SELECT id, username, balance, role FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

// Get matches with odds
app.get('/api/matches', (req, res) => {
  const matches = db.prepare('SELECT * FROM matches ORDER BY id DESC').all();

  const data = matches.map(match => {
    const odds = db.prepare('SELECT id, pick, odd FROM odds WHERE match_id = ?').all(match.id);
    return { ...match, odds };
  });

  res.json(data);
});

// Place bet
app.post('/api/bets', auth, (req, res) => {
  const { selections, stake } = req.body;

  if (!Array.isArray(selections) || selections.length === 0) {
    return res.status(400).json({ message: 'At least one selection is required' });
  }

  if (!stake || stake <= 0) {
    return res.status(400).json({ message: 'Valid stake is required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  if (user.balance < stake) {
    return res.status(400).json({ message: 'Insufficient balance' });
  }

  let totalOdds = 1;

  for (const selection of selections) {
    const oddRow = db.prepare('SELECT * FROM odds WHERE id = ?').get(selection.oddId);

    if (!oddRow) {
      return res.status(400).json({ message: 'Invalid odd selected' });
    }

    totalOdds *= oddRow.odd;
  }

  const potentialWin = totalOdds * stake;

  const insertBet = db.prepare(`
    INSERT INTO bets (user_id, stake, total_odds, potential_win, selections)
    VALUES (?, ?, ?, ?, ?)
  `);

  const updateBalance = db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?');

  const transaction = db.transaction(() => {
    updateBalance.run(stake, req.user.id);
    return insertBet.run(req.user.id, stake, totalOdds, potentialWin, JSON.stringify(selections));
  });

  const result = transaction();

  res.json({
    message: 'Bet placed successfully',
    betId: result.lastInsertRowid,
    totalOdds,
    stake,
    potentialWin
  });
});

// User bet history
app.get('/api/bets', auth, (req, res) => {
  const bets = db.prepare('SELECT * FROM bets WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
  res.json(bets.map(bet => ({ ...bet, selections: JSON.parse(bet.selections) })));
});

// Admin: add match
app.post('/api/admin/matches', auth, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin only' });
  }

  const { league, home_team, away_team, sport, status, match_time, odds } = req.body;

  if (!league || !home_team || !away_team || !sport || !match_time || !Array.isArray(odds)) {
    return res.status(400).json({ message: 'Missing match details' });
  }

  const insertMatch = db.prepare(`
    INSERT INTO matches (league, home_team, away_team, sport, status, match_time)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertOdd = db.prepare('INSERT INTO odds (match_id, pick, odd) VALUES (?, ?, ?)');

  const transaction = db.transaction(() => {
    const result = insertMatch.run(league, home_team, away_team, sport, status || 'upcoming', match_time);

    for (const item of odds) {
      insertOdd.run(result.lastInsertRowid, item.pick, item.odd);
    }

    return result.lastInsertRowid;
  });

  const matchId = transaction();
  res.json({ message: 'Match added successfully', matchId });
});

app.listen(PORT, () => {
  console.log(`BetPro API running on http://localhost:${PORT}`);
});
