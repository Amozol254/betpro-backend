res.json({
  balance: user.balance,
  betId: someId,
  crashPoint: crashPoint
});
// BetPro Backend API - MongoDB + JWT + Wallet + Betting + Admin

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

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected ✅'))
  .catch((err) => console.log('MongoDB Error ❌', err.message));

// =====================
// SCHEMAS
// =====================
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  balance: { type: Number, default: 0 },
  role: { type: String, enum: ['user', 'admin'], default: 'user' }
}, { timestamps: true });

const matchSchema = new mongoose.Schema({
  league: { type: String, required: true },
  home_team: { type: String, required: true },
  away_team: { type: String, required: true },
  sport: { type: String, required: true },
  status: { type: String, enum: ['upcoming', 'live', 'finished', 'cancelled'], default: 'upcoming' },
  match_time: { type: String, required: true },
  result: { type: String, default: null },
  odds: [
    {
      oddId: Number,
      pick: String,
      odd: Number
    }
  ]
}, { timestamps: true });

const betSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  selections: Array,
  stake: Number,
  total_odds: Number,
  potential_win: Number,
  status: { type: String, enum: ['pending', 'won', 'lost', 'cancelled'], default: 'pending' }
}, { timestamps: true });

const transactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['deposit', 'withdraw'], required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  note: String
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const Match = mongoose.model('Match', matchSchema);
const Bet = mongoose.model('Bet', betSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);

// =====================
// AUTH MIDDLEWARE
// =====================
function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Login required' });
  }

  const token = header.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin only' });
  }
  next();
}

// =====================
// SEED MATCHES
// =====================
async function seedMatches() {
  const count = await Match.countDocuments();
  if (count > 0) return;

  await Match.insertMany([
    {
      league: 'Premier League', home_team: 'Arsenal', away_team: 'Chelsea', sport: 'football', status: 'upcoming', match_time: 'Today 8:00 PM',
      odds: [
        { oddId: 1, pick: 'Arsenal Win', odd: 1.85 },
        { oddId: 2, pick: 'Draw', odd: 3.20 },
        { oddId: 3, pick: 'Chelsea Win', odd: 4.10 }
      ]
    },
    {
      league: 'La Liga', home_team: 'Barcelona', away_team: 'Sevilla', sport: 'football', status: 'upcoming', match_time: 'Tomorrow 9:30 PM',
      odds: [
        { oddId: 4, pick: 'Barcelona Win', odd: 1.55 },
        { oddId: 5, pick: 'Draw', odd: 4.00 },
        { oddId: 6, pick: 'Sevilla Win', odd: 5.70 }
      ]
    },
    {
      league: 'Live Basketball', home_team: 'Lakers', away_team: 'Celtics', sport: 'basketball', status: 'live', match_time: '3rd Quarter',
      odds: [
        { oddId: 7, pick: 'Lakers Win', odd: 1.95 },
        { oddId: 8, pick: 'Over 180.5', odd: 1.88 },
        { oddId: 9, pick: 'Celtics Win', odd: 2.05 }
      ]
    }
  ]);

  console.log('Sample matches added ✅');
}

mongoose.connection.once('open', seedMatches);

// =====================
// BASIC ROUTE
// =====================
app.get('/', (req, res) => {
  res.json({ message: 'BetPro API is running', database: 'MongoDB connected' });
});

// =====================
// AUTH ROUTES
// =====================
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
    if (exists) return res.status(400).json({ message: 'Username already exists' });

    const hashedPassword = bcrypt.hashSync(password, 10);
    const user = await User.create({ username, password: hashedPassword, balance: 0, role: 'user' });

    res.json({ message: 'Account created successfully', user: safeUser(user) });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (!user) return res.status(401).json({ message: 'Invalid username or password' });

    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) return res.status(401).json({ message: 'Invalid username or password' });

    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ message: 'Login successful', token, user: safeUser(user) });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.get('/api/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// =====================
// PUBLIC MATCH ROUTES
// =====================
app.get('/api/matches', async (req, res) => {
  try {
    const matches = await Match.find().sort({ createdAt: -1 });
    res.json(matches);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// =====================
// WALLET ROUTES
// =====================
app.post('/api/wallet/deposit', auth, async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ message: 'Valid amount is required' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Demo deposit: auto-approved. Later this will connect to M-Pesa STK push.
    user.balance = Number((user.balance + Number(amount)).toFixed(2));
    await user.save();

    const transaction = await Transaction.create({
      user: user._id,
      type: 'deposit',
      amount: Number(amount),
      status: 'approved',
      note: 'Demo deposit auto-approved'
    });

    res.json({ message: 'Deposit successful', balance: user.balance, transaction });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.post('/api/wallet/withdraw', auth, async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ message: 'Valid amount is required' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.balance < amount) return res.status(400).json({ message: 'Insufficient balance' });

    // Withdrawal is pending until admin approves.
    const transaction = await Transaction.create({
      user: user._id,
      type: 'withdraw',
      amount: Number(amount),
      status: 'pending',
      note: 'Awaiting admin approval'
    });

    res.json({ message: 'Withdrawal request submitted', transaction });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.get('/api/wallet/transactions', auth, async (req, res) => {
  try {
    const transactions = await Transaction.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// =====================
// BETTING ROUTES
// =====================
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
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.balance < stake) return res.status(400).json({ message: 'Insufficient balance' });

    let totalOdds = 1;
    const cleanSelections = [];

    for (const selection of selections) {
      const match = await Match.findOne({ 'odds.oddId': selection.oddId });
      if (!match) return res.status(400).json({ message: 'Invalid odd selected' });
      if (match.status === 'finished' || match.status === 'cancelled') {
        return res.status(400).json({ message: 'Cannot bet on finished or cancelled match' });
      }

      const selectedOdd = match.odds.find(o => o.oddId === selection.oddId);
      if (!selectedOdd) return res.status(400).json({ message: 'Invalid odd selected' });

      totalOdds *= selectedOdd.odd;
      cleanSelections.push({
        oddId: selectedOdd.oddId,
        matchId: match._id,
        match: `${match.home_team} vs ${match.away_team}`,
        pick: selectedOdd.pick,
        odd: selectedOdd.odd
      });
    }

    const potentialWin = totalOdds * Number(stake);
    user.balance = Number((user.balance - Number(stake)).toFixed(2));
    await user.save();

    const bet = await Bet.create({
      user: user._id,
      selections: cleanSelections,
      stake: Number(stake),
      total_odds: Number(totalOdds.toFixed(2)),
      potential_win: Number(potentialWin.toFixed(2)),
      status: 'pending'
    });

    res.json({ message: 'Bet placed successfully', bet, balance: user.balance });
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

// =====================
// ADMIN ROUTES
// =====================
app.get('/api/admin/users', auth, adminOnly, async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.post('/api/admin/matches', auth, adminOnly, async (req, res) => {
  try {
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

    const match = await Match.create({ league, home_team, away_team, sport, status: status || 'upcoming', match_time, odds: formattedOdds });
    res.json({ message: 'Match added successfully', match });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.put('/api/admin/matches/:id', auth, adminOnly, async (req, res) => {
  try {
    const match = await Match.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!match) return res.status(404).json({ message: 'Match not found' });
    res.json({ message: 'Match updated successfully', match });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.get('/api/admin/bets', auth, adminOnly, async (req, res) => {
  try {
    const bets = await Bet.find().populate('user', 'username balance role').sort({ createdAt: -1 });
    res.json(bets);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.put('/api/admin/bets/:id/settle', auth, adminOnly, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['won', 'lost', 'cancelled'].includes(status)) {
      return res.status(400).json({ message: 'Status must be won, lost, or cancelled' });
    }

    const bet = await Bet.findById(req.params.id);
    if (!bet) return res.status(404).json({ message: 'Bet not found' });
    if (bet.status !== 'pending') return res.status(400).json({ message: 'Bet already settled' });

    const user = await User.findById(bet.user);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (status === 'won') {
      user.balance = Number((user.balance + bet.potential_win).toFixed(2));
      await user.save();
    }

    if (status === 'cancelled') {
      user.balance = Number((user.balance + bet.stake).toFixed(2));
      await user.save();
    }

    bet.status = status;
    await bet.save();

    res.json({ message: 'Bet settled successfully', bet, userBalance: user.balance });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.get('/api/admin/transactions', auth, adminOnly, async (req, res) => {
  try {
    const transactions = await Transaction.find().populate('user', 'username balance role').sort({ createdAt: -1 });
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.put('/api/admin/withdrawals/:id/approve', auth, adminOnly, async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' });
    if (transaction.type !== 'withdraw') return res.status(400).json({ message: 'Not a withdrawal' });
    if (transaction.status !== 'pending') return res.status(400).json({ message: 'Already processed' });

    const user = await User.findById(transaction.user);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.balance < transaction.amount) return res.status(400).json({ message: 'Insufficient balance' });

    user.balance = Number((user.balance - transaction.amount).toFixed(2));
    await user.save();

    transaction.status = 'approved';
    transaction.note = 'Approved by admin';
    await transaction.save();

    res.json({ message: 'Withdrawal approved', transaction, balance: user.balance });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.put('/api/admin/withdrawals/:id/reject', auth, adminOnly, async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' });
    if (transaction.type !== 'withdraw') return res.status(400).json({ message: 'Not a withdrawal' });
    if (transaction.status !== 'pending') return res.status(400).json({ message: 'Already processed' });

    transaction.status = 'rejected';
    transaction.note = 'Rejected by admin';
    await transaction.save();

    res.json({ message: 'Withdrawal rejected', transaction });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// =====================
// HELPER
// =====================
function safeUser(user) {
  return {
    id: user._id,
    username: user.username,
    balance: user.balance,
    role: user.role
  };
}

app.listen(PORT, () => {
  console.log(`BetPro API running on port ${PORT}`);
});
    app.post('/api/aviator/start', auth, async (req, res) => {
  const { stake } = req.body;

  const user = await User.findById(req.user.id);

  if (!user) return res.status(404).json({ message: 'User not found' });

  if (user.balance < stake) {
    return res.status(400).json({ message: 'Not enough money' });
  }

  user.balance -= stake;
  await user.save();

  res.json({ balance: user.balance });
});
