// BetPro Backend API - Working Render Version

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'betpro_secret_key_change_later';

app.use(cors());
app.use(express.json());

// Temporary memory storage. Data resets when Render restarts.
let users = [];
let bets = [];

const matches = [
  {
    id: 1,
    league: 'Premier League',
    home_team: 'Arsenal',
    away_team: 'Chelsea',
    sport: 'football',
    status: 'upcoming',
    match_time: 'Today 8:00 PM',
    odds: [
      { id: 1, pick: 'Arsenal Win', odd: 1.85 },
      { id: 2, pick: 'Draw', odd: 3.20 },
      { id: 3, pick: 'Chelsea Win', odd: 4.10 }
    ]
  },
  {
    id: 2,
    league: 'La Liga',
    home_team: 'Barcelona',
    away_team: 'Sevilla',
    sport: 'football',
    status: 'upcoming',
    match_time: 'Tomorrow 9:30 PM',
    odds: [
      { id: 4, pick: 'Barcelona Win', odd: 1.55 },
      { id: 5, pick: 'Draw', odd: 4.00 },
      { id: 6, pick: 'Sevilla Win', odd: 5.70 }
    ]
  },
  {
    id: 3,
    league: 'Tennis',
    home_team: 'Nadal',
    away_team: 'Djokovic',
    sport: 'tennis',
    status: 'upcoming',
    match_time: 'Tomorrow 5:00 PM',
    odds: [
      { id: 7, pick: 'Nadal Win', odd: 2.15 },
      { id: 8, pick: 'Over 3.5 Sets', odd: 1.75 },
      { id: 9, pick: 'Djokovic Win', odd: 1.68 }
    ]
  },
  {
    id: 4,
    league: 'Live Basketball',
    home_team: 'Lakers',
    away_team: 'Celtics',
    sport: 'basketball',
    status: 'live',
    match_time: '3rd Quarter',
    odds: [
      { id: 10, pick: 'Lakers Win', odd: 1.95 },
      { id: 11, pick: 'Over 180.5', odd: 1.88 },
      { id: 12, pick: 'Celtics Win', odd: 2.05 }
    ]
  }
];

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

app.get('/', (req, res) => {
  res.json({ message: 'BetPro API is running' });
});

app.get('/api/matches', (req, res) => {
  res.json(matches);
});

app.post('/api/register', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }

  const existingUser = users.find(user => user.username === username);

  if (existingUser) {
    return res.status(400).json({ message: 'Username already exists' });
  }

  const newUser = {
    id: users.length + 1,
    username,
    password: bcrypt.hashSync(password, 10),
    balance: 5000,
    role: 'user'
  };

  users.push(newUser);

  res.json({
    message: 'Account created successfully',
    user: {
      id: newUser.id,
      username: newUser.username,
      balance: newUser.balance,
      role: newUser.role
    }
  });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find(item => item.username === username);

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

app.get('/api/me', auth, (req, res) => {
  const user = users.find(item => item.id === req.user.id);

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  res.json({
    id: user.id,
    username: user.username,
    balance: user.balance,
    role: user.role
  });
});

app.post('/api/bets', auth, (req, res) => {
  const { selections, stake } = req.body;

  if (!Array.isArray(selections) || selections.length === 0) {
    return res.status(400).json({ message: 'At least one selection is required' });
  }

  if (!stake || stake <= 0) {
    return res.status(400).json({ message: 'Valid stake is required' });
  }

  const user = users.find(item => item.id === req.user.id);

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  if (user.balance < stake) {
    return res.status(400).json({ message: 'Insufficient balance' });
  }

  let totalOdds = 1;
  let cleanSelections = [];

  for (const selection of selections) {
    let foundOdd = null;
    let foundMatch = null;

    for (const match of matches) {
      const odd = match.odds.find(item => item.id === selection.oddId);
      if (odd) {
        foundOdd = odd;
        foundMatch = match;
      }
    }

    if (!foundOdd || !foundMatch) {
      return res.status(400).json({ message: 'Invalid odd selected' });
    }

    totalOdds *= foundOdd.odd;
    cleanSelections.push({
      oddId: foundOdd.id,
      match: `${foundMatch.home_team} vs ${foundMatch.away_team}`,
      pick: foundOdd.pick,
      odd: foundOdd.odd
    });
  }

  const potentialWin = totalOdds * stake;
  user.balance -= stake;

  const newBet = {
    id: bets.length + 1,
    user_id: user.id,
    selections: cleanSelections,
    stake,
    total_odds: Number(totalOdds.toFixed(2)),
    potential_win: Number(potentialWin.toFixed(2)),
    status: 'pending',
    created_at: new Date().toLocaleString()
  };

  bets.unshift(newBet);

  res.json({
    message: 'Bet placed successfully',
    bet: newBet,
    balance: Number(user.balance.toFixed(2))
  });
});

app.get('/api/bets', auth, (req, res) => {
  const userBets = bets.filter(bet => bet.user_id === req.user.id);
  res.json(userBets);
});

app.listen(PORT, () => {
  console.log(`BetPro API running on port ${PORT}`);
});
         
