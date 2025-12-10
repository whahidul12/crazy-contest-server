import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(cookieParser());

// =================================================
// JWT MIDDLEWARE
// =================================================

const verifyToken = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) {
        return res.status(401).send({ message: 'Unauthorized access' });
    }
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            console.error("JWT verification failed:", err);
            return res.status(401).send({ message: 'Unauthorized access' });
        }
        req.decoded = decoded;
        next();
    });
};

// =================================================
// MONGODB SETUP
// =================================================

const uri = process.env.DB_URI;

let client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });

let db, usersCollection, contestsCollection, participatedCollection, submissionsCollection;

const connectDB = async () => {
    try {
        await client.connect();
        db = client.db("contest_craze_db");
        usersCollection = db.collection("users_collections");
        contestsCollection = db.collection("contests_collections");
        participatedCollection = db.collection("participated_collections");
        submissionsCollection = db.collection("submissions_collections");
        console.log("MongoDB connected ...");
    } catch (error) {
        console.error("MongoDB connection failed:", error);
        // Exit process or handle error appropriately for production
    }
}

connectDB();


// =================================================
// ROLE VERIFICATION MIDDLEWARE (Optional but good practice)
// =================================================

const verifyAdmin = async (req, res, next) => {
    const email = req.decoded.email;
    const user = await usersCollection.findOne({ email });
    if (user?.role !== 'Admin') {
        return res.status(403).send({ message: 'Forbidden access' });
    }
    next();
}

const verifyCreator = async (req, res, next) => {
    const email = req.decoded.email;
    const user = await usersCollection.findOne({ email });
    if (user?.role !== 'Contest Creator') {
        return res.status(403).send({ message: 'Forbidden access' });
    }
    next();
}


// =================================================
// ROUTES
// =================================================

app.get("/", (req, res) => {
    res.send("Backend is running");
});

// -------------------------------------------------
// 1. JWT / Auth Endpoints
// -------------------------------------------------

app.post('/jwt', async (req, res) => {
    const user = req.body;
    const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
    res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // Use secure in production
        sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Strict', // Use None in production for cross-site cookies
        maxAge: 3600000 // 1 hour
    }).send({ success: true });
});

app.post('/logout', async (req, res) => {
    res.clearCookie('token', {
        maxAge: 0,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Strict'
    }).send({ success: true });
});

// -------------------------------------------------
// 2. User Management Endpoints
// -------------------------------------------------

app.get("/users", async (req, res) => {
    try {
        const users = await usersCollection.find().toArray();
        res.status(200).json(users);
    } catch (err) {
        console.error("Error loading users:", err);
        res.status(500).json({ error: "Failed to load users" });
    }
});

// Add/Save user on register/google login
app.post("/users", async (req, res) => {
    const user = req.body;
    const query = { email: user.email };
    const existingUser = await usersCollection.findOne(query);
    if (existingUser) {
        return res.send({ message: "User already exists", insertedId: null });
    }
    // Set default role and initial stats
    const newUser = {
        ...user,
        role: user.role || 'Normal User',
        wins: 0,
        participatedCount: 0,
        winPercentage: 0,
        bio: '',
        address: ''
    }
    const result = await usersCollection.insertOne(newUser);
    res.status(201).json(result);
});

// Get user role for dashboard check
app.get("/users/role/:email", verifyToken, async (req, res) => {
    const email = req.params.email;
    if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden access' });
    }
    const user = await usersCollection.findOne({ email });
    res.send({ role: user?.role || 'Normal User' });
});

// Get single user data
app.get("/users/:email", verifyToken, async (req, res) => {
    const email = req.params.email;
    if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden access' });
    }
    const user = await usersCollection.findOne({ email }, { projection: { password: 0 } });
    res.send(user);
});

// Update user profile
app.put("/users/:email", verifyToken, async (req, res) => {
    const email = req.params.email;
    if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden access' });
    }
    const updatedUser = req.body;
    const filter = { email };
    const updateDoc = {
        $set: {
            name: updatedUser.name,
            photo: updatedUser.photo,
            address: updatedUser.address,
        }
    };
    const result = await usersCollection.updateOne(filter, updateDoc);
    res.send(result);
});


// -------------------------------------------------
// 3. Contest Endpoints
// -------------------------------------------------

// Creator: Add new contest
app.post("/contests", verifyToken, verifyCreator, async (req, res) => {
    const newContest = req.body;
    const result = await contestsCollection.insertOne(newContest);
    res.status(201).json(result);
});

// Creator: Get all contests created by user
app.get("/contests/creator/:email", verifyToken, async (req, res) => {
    const email = req.params.email;
    if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden access' });
    }
    const contests = await contestsCollection.find({ creatorEmail: email }).toArray();
    res.send(contests);
});

// Creator: Edit contest (only if Pending)
app.put("/contests/:id", verifyToken, async (req, res) => {
    const id = req.params.id;
    const updatedContest = req.body;
    const filter = { _id: new ObjectId(id), creatorEmail: req.decoded.email, status: 'Pending' };
    const updateDoc = { $set: updatedContest };
    const result = await contestsCollection.updateOne(filter, updateDoc);
    res.send(result);
});

// Creator: Delete contest (only if Pending)
app.delete("/contests/:id", verifyToken, async (req, res) => {
    const id = req.params.id;
    const filter = { _id: new ObjectId(id), creatorEmail: req.decoded.email, status: 'Pending' };
    const result = await contestsCollection.deleteOne(filter);
    res.send(result);
});

// Public/User: Get all approved contests (with filtering)
app.get("/contests/approved", async (req, res) => {
    const { type } = req.query;
    let query = { status: 'Confirmed' };
    if (type && type !== 'All') {
        query.type = type;
    }
    const contests = await contestsCollection.find(query).sort({ participantsCount: -1 }).toArray();
    res.send(contests);
});

// Get top 6 confirmed contests based on highest participantsCount
app.get("/contests/popular", async (req, res) => {
    try {
        const popularContests = await contestsCollection.find({ status: 'Confirmed' })
            .sort({ participantsCount: -1 }) // Sort by participantsCount in descending order
            .limit(6) // Limit the results to the top 6
            .toArray();

        res.send(popularContests);
    } catch (error) {
        console.error("Error fetching popular contests:", error);
        res.status(500).send({ message: "Failed to fetch popular contests" });
    }
});

// Public: Get a single contest by ID
app.get("/contests/:id", verifyToken, async (req, res) => {
    const id = req.params.id;
    const contest = await contestsCollection.findOne({ _id: new ObjectId(id) });
    res.send(contest);
});

// Admin: Get ALL contests (with pagination)
app.get("/contests/all", verifyToken, verifyAdmin, async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const contests = await contestsCollection.find().skip(skip).limit(limit).toArray();
    const totalCount = await contestsCollection.countDocuments();
    res.send({ contests, totalCount });
});


// Admin: Update contest status (Confirm/Reject)
app.patch("/contests/status/:id", verifyToken, verifyAdmin, async (req, res) => {
    const id = req.params.id;
    const { status } = req.body; // 'Confirmed' or 'Rejected'
    const updateDoc = { $set: { status } };
    const result = await contestsCollection.updateOne({ _id: new ObjectId(id) }, updateDoc);
    res.send(result);
});

// -------------------------------------------------
// 4. Participation/Payment Endpoints
// -------------------------------------------------

// Check if user already registered for a contest
app.get("/participated/check/:contestId", verifyToken, async (req, res) => {
    const { contestId } = req.params;
    const { email } = req.query;

    if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden access' });
    }

    const participation = await participatedCollection.findOne({
        contestId,
        participantEmail: email
    });
    res.send({ isRegistered: !!participation });
});

// Record successful participation/payment
app.post("/participated", verifyToken, async (req, res) => {
    const participationInfo = req.body;

    // 1. Record participation
    const result = await participatedCollection.insertOne(participationInfo);

    // 2. Update Contest: Increment participant count
    await contestsCollection.updateOne(
        { _id: new ObjectId(participationInfo.contestId) },
        { $inc: { participantsCount: 1 } }
    );

    // 3. Update User: Increment participatedCount
    await usersCollection.updateOne(
        { email: participationInfo.participantEmail },
        { $inc: { participatedCount: 1 } }
    );

    res.send(result);
});

// User: Get list of participated contests
app.get("/participated/:email", verifyToken, async (req, res) => {
    const email = req.params.email;
    if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden access' });
    }
    const participatedList = await participatedCollection.find({ participantEmail: email }).toArray();

    // Fetch contest details for name, image, etc.
    const contestIds = participatedList.map(p => new ObjectId(p.contestId));
    const contestsDetails = await contestsCollection.find({ _id: { $in: contestIds } }).toArray();

    // Merge participation info with contest details
    const mergedData = participatedList.map(p => {
        const detail = contestsDetails.find(c => c._id.toString() === p.contestId);
        return {
            ...p,
            contestName: detail?.name,
            deadline: detail?.deadline,
            image: detail?.image,
        };
    });

    res.send(mergedData);
});

// -------------------------------------------------
// 5. Submission Endpoints
// -------------------------------------------------

// Record task submission (after successful payment)
app.post("/submissions", verifyToken, async (req, res) => {
    const submissionInfo = req.body;

    // Check if user actually registered for the contest first
    const isRegistered = await participatedCollection.findOne({
        contestId: submissionInfo.contestId,
        participantEmail: submissionInfo.participantEmail
    });

    if (!isRegistered) {
        return res.status(403).send({ message: 'User has not registered for this contest.' });
    }

    // Add participant name for creator view
    const user = await usersCollection.findOne({ email: submissionInfo.participantEmail });
    submissionInfo.participantName = user?.name || 'Unknown User';

    // Insert submission
    const result = await submissionsCollection.insertOne(submissionInfo);
    res.send(result);
});

// Creator: Get submissions for their contests
app.get("/submissions/creator/:email", verifyToken, verifyCreator, async (req, res) => {
    const creatorEmail = req.params.email;
    const contestIdFilter = req.query.contestId;

    // 1. Get contests created by this user
    let contestQuery = { creatorEmail };
    if (contestIdFilter) {
        contestQuery._id = new ObjectId(contestIdFilter);
    }
    const creatorContests = await contestsCollection.find(contestQuery).toArray();
    const contestIds = creatorContests.map(c => c._id.toString());

    // 2. Get submissions for those contest IDs
    const submissions = await submissionsCollection.find({
        contestId: { $in: contestIds }
    }).toArray();

    // 3. Merge contest name into submissions for display
    const mergedSubmissions = submissions.map(sub => {
        const contest = creatorContests.find(c => c._id.toString() === sub.contestId);
        return {
            ...sub,
            contestName: contest?.name || sub.contestName // Use fetched name if available
        };
    });

    res.send(mergedSubmissions);
});

// -------------------------------------------------
// 6. Winner Declaration Endpoints
// -------------------------------------------------

// Creator: Declare Winner
app.put("/contests/declare-winner/:id", verifyToken, verifyCreator, async (req, res) => {
    const id = req.params.id;
    const { winnerEmail, submissionId } = req.body;

    // 1. Get Contest details
    const contest = await contestsCollection.findOne({ _id: new ObjectId(id) });
    if (!contest || contest.creatorEmail !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden or Contest not found' });
    }

    // 2. Check if deadline passed and winner not declared
    if (new Date() < new Date(contest.deadline) || contest.winner) {
        return res.status(400).send({ message: 'Contest must be ended and winner not declared.' });
    }

    // 3. Get Winner User Info
    const winnerUser = await usersCollection.findOne({ email: winnerEmail });
    if (!winnerUser) {
        return res.status(404).send({ message: 'Winner user not found' });
    }

    // 4. Update Contest: Set winner and status
    const updateContestResult = await contestsCollection.updateOne(
        { _id: new ObjectId(id) },
        {
            $set: {
                winner: {
                    email: winnerUser.email,
                    name: winnerUser.name,
                    photo: winnerUser.photo,
                    prizeMoney: contest.prizeMoney
                },
                status: 'Closed' // Mark contest as closed
            }
        }
    );

    // 5. Update Winner User: Increment wins and recalculate win percentage
    await usersCollection.updateOne(
        { email: winnerEmail },
        [
            { $set: { wins: { $add: ["$wins", 1] } } },
            {
                $set: {
                    winPercentage: {
                        $multiply: [
                            { $divide: ["$wins", "$participatedCount"] },
                            100
                        ]
                    }
                }
            }
        ]
    );

    res.send(updateContestResult);
});


// User: Get all winning contests (where user is the declared winner)
app.get("/contests/winner/:email", verifyToken, async (req, res) => {
    const email = req.params.email;
    if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden access' });
    }
    const winningContests = await contestsCollection.find({ 'winner.email': email }).toArray();
    res.send(winningContests);
});


// -------------------------------------------------
// 7. Leaderboard Endpoints
// -------------------------------------------------

// Get leaderboard ranked by wins
app.get("/users/leaderboard", async (req, res) => {
    const leaderboard = await usersCollection.find(
        { wins: { $gt: 0 } }, // Only include users with at least one win
        { projection: { name: 1, email: 1, photo: 1, wins: 1, _id: 1 } }
    ).sort({ wins: -1, participatedCount: 1 }).limit(10).toArray(); // Rank by wins, then by lower participation count (tie-breaker)

    res.send(leaderboard);
});


// =======================================================
// LOCAL DEVELOPMENT
// =======================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Local server running at http://localhost:${PORT}/`);
});


export default app;