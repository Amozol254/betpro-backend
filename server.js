// BetPro Backend API - MongoDB Permanent Version

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'betpro_secret_key_change_later';

app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected ✅'))
  .catch((err) => console.log('MongoDB Error ❌', err.message));

// Schemas
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  balance: { type: Number, default: 5000 },
  role: { type: String, default: 'user' }
}, { timestamps: true });

const matchSchema = new mongoose.Schema({
  league: String,
  home_team: String,
  away_team: String,
  sport: String,
  status: { type: String, default: 'upcoming' },
  match_time: String,
  odds: [
    {
      oddId: Number,
      pick: String,
      odd: Number
    }
  ]
}, { timestamps: true });

const betSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  selections: Array,
  stake: Number,
  total_odds: Number,
  potential_win: Number,
  status: { type: String, default: 'pending' }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const Match = mongoose.model('Match', matchSchema);
const Bet = mongoose.model('Bet', betSchema);

// Auth middleware
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

// Seed sample matches
async function seedMatches() {
  const count = await Match.countDocuments();

  if (count > 0) return;

  await Match.insertMany([
    {
      league: 'Premier League',
      home_team: 'Arsenal',
      away_team: 'Chelsea',
      sport: 'football',
      status: 'upcoming',
      match_time: 'Today 8:00 PM',
      odds: [
        { oddId: 1, pick: 'Arsenal Win', odd: 1.85 },
        { oddId: 2, pick: 'Draw', odd: 3.20 },
        { oddId: 3, pick: 'Chelsea Win', odd: 4.10 }
      ]
    },
    {
      league: 'La Liga',
      home_team: 'Barcelona',
      away_team: 'Sevilla',
      sport: 'football',
      status: 'upcoming',
      match_time: 'Tomorrow 9:30 PM',
      odds: [
        { oddId: 4, pick: 'Barcelona Win', odd: 1.55 },
        { oddId: 5, pick: 'Draw', odd: 4.00 },
        { oddId: 6, pick: 'Sevilla Win', odd: 5.70 }
      ]
    },
    {
      league: 'Tennis',
      home_team: 'Nadal',
      away_team: 'Djokovic',
      sport: 'tennis',
      status: 'upcoming',
      match_time: 'Tomorrow 5:00 PM',
      odds: [
        { oddId: 7, pick: 'Nadal Win', odd: 2.15 },
        { oddId: 8, pick: 'Over 3.5 Sets', odd: 1.75 },
        { oddId: 9, pick: 'Djokovic Win', odd: 1.68 }
      ]
    },
    {
      league: 'Live Basketball',
      home_team: 'Lakers',
      away_team: 'Celtics',
      sport: 'basketball',
      status: 'live',
      match_time: '3rd Quarter',
      odds: [
        { oddId: 10, pick: 'Lakers Win', odd: 1.95 },
        { oddId: 11, pick: 'Over 180.5', odd: 1.88 },
        { oddId: 12, pick: 'Celtics Win', odd: 2.05 }
      ]
    }
  ]);

  console.log('Sample matches added ✅');
}

mongoose.connection.once('open', seedMatches);

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'BetPro API is running', database: 'MongoDB connected' });
});

app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const exists = await User.findOne({ username });

    if (exists) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);

    const user = await User.create({
      username,
      password: hashedPassword,
      balance: 5000,
      role: 'user'
    });

    res.json({
      message: 'Account created successfully',
      user: {
        id: user._id,
        username: user.username,
        balance: user.balance,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });

    if (!user) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    const validPassword = bcrypt.compareSync(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        username: user.username,
        balance: user.balance,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.get('/api/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.get('/api/matches', async (req, res) => {
  try {
    const matches = await Match.find().sort({ createdAt: -1 });
    res.json(matches);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.post('/api/bets', auth, async (req, res) => {
  try {
    const { selections, stake } = req.body;

    if (!Array.isArray(selections) || selections.length === 0) {
      return res.status(400).json({ message: 'At least one selection is required' });
    }

    if (!stake || stake <= 0) {
      return res.status(400).json({ message: 'Valid stake is required' });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.balance < stake) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }

    let totalOdds = 1;
    const cleanSelections = [];

    for (const selection of selections) {
      const match = await Match.findOne({ 'odds.oddId': selection.oddId });

      if (!match) {
        return res.status(400).json({ message: 'Invalid odd selected' });
      }

      const selectedOdd = match.odds.find(o => o.oddId === selection.oddId);

      if (!selectedOdd) {
        return res.status(400).json({ message: 'Invalid odd selected' });
      }

      totalOdds *= selectedOdd.odd;

      cleanSelections.push({
        oddId: selectedOdd.oddId,
        match: `${match.home_team} vs ${match.away_team}`,
        pick: selectedOdd.pick,
        odd: selectedOdd.odd
      });
    }

    const potentialWin = totalOdds * stake;

    user.balance = Number((user.balance - stake).toFixed(2));
    await user.save();

    const bet = await Bet.create({
      user: user._id,
      selections: cleanSelections,
      stake,
      total_odds: Number(totalOdds.toFixed(2)),
      potential_win: Number(potentialWin.toFixed(2)),
      status: 'pending'
    });

    res.json({
      message: 'Bet placed successfully',
      bet,
      balance: user.balance
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.get('/api/bets', auth, async (req, res) => {
  try {
    const bets = await Bet.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json(bets);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Admin: Add match
app.post('/api/admin/matches', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin only' });
    }

    const { league, home_team, away_team, sport, status, match_time, odds } = req.body;

    if (!league || !home_team || !away_team || !sport || !match_time || !Array.isArray(odds)) {
      return res.status(400).json({ message: 'Missing match details' });
    }

    const latestMatch = await Match.findOne().sort({ createdAt: -1 });
    let nextOddId = 100;

    if (latestMatch && latestMatch.odds.length > 0) {
      nextOddId = Math.max(...latestMatch.odds.map(o => o.oddId)) + 1;
    }

    const formattedOdds = odds.map(item => ({
      oddId: nextOddId++,
      pick: item.pick,
      odd: Number(item.odd)
    }));

    const match = await Match.create({
      league,
      home_team,
      away_team,
      sport,
      status: status || 'upcoming',
      match_time,
      odds: formattedOdds
    });

    res.json({ message: 'Match added successfully', match });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`BetPro API running on port ${PORT}`);
});
      
