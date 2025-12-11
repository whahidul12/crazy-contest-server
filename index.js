import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";

const app = express();

// Middleware
app.use(
    cors({
        origin: "*", // public access for leaderboard
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    })
);
app.use(express.json());
app.use(cookieParser());

// =================================================
// MONGODB SETUP - MODIFIED FOR VERCEL
// =================================================

const uri = process.env.DB_URI;
let client;
let db, usersCollection, contestsCollection, participatedCollection, submissionsCollection;

let isConnected = false;

const connectDB = async () => {
    if (isConnected && client) {
        return;
    }

    try {
        client = new MongoClient(uri, {
            serverSelectionTimeoutMS: 5000,
            maxPoolSize: 10, // Limit connection pool
        });

        await client.connect();

        db = client.db("contest_craze_db");
        usersCollection = db.collection("users_collections");
        contestsCollection = db.collection("contests_collections");
        participatedCollection = db.collection("participated_collections");
        submissionsCollection = db.collection("submissions_collections");

        isConnected = true;
        console.log("MongoDB connected ...");
    } catch (error) {
        console.error("MongoDB connection failed:", error);
        isConnected = false;
        throw error;
    }
};

// Middleware to ensure DB connection before each request
const ensureDBConnection = async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (error) {
        console.error("Database connection error:", error);
        res.status(500).json({ error: "Database connection failed" });
    }
};

// Apply to all routes
app.use(ensureDBConnection);

// =================================================
// JWT MIDDLEWARE
// =================================================

const verifyToken = (req, res, next) => {
    // 1. Check for token in the Authorization Header (Bearer Token)
    let token = req.headers.authorization;
    if (token && token.startsWith('Bearer ')) {
        token = token.split(' ')[1]; // Extract the token string
    } else {
        // 2. Fallback check for token in cookies (if you still need it for other routes)
        token = req.cookies.token;
    }

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
// ROLE VERIFICATION MIDDLEWARE
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
// 0. JWT / Auth Endpoints
// -------------------------------------------------

// BACKEND: index.js - Modify the /jwt endpoint
app.post('/jwt', async (req, res) => {
    const user = req.body;
    console.log(user);
    const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
    res.send({ token: token, success: true });
});

app.post('/logout', async (req, res) => {
    res.clearCookie('token', {
        maxAge: 0,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Strict'
    }).send({ success: true });
});

// -------------------------------------------------
// 1. Leaderboard Endpoints
// -------------------------------------------------

app.get("/users/leaderboard", async (req, res) => {
    const leaderboard = await usersCollection.find(
        { wins: { $gt: 0 } },
        { projection: { name: 1, email: 1, photo: 1, wins: 1, _id: 1 } }
    ).sort({ wins: -1, participatedCount: 1 }).limit(10).toArray();
    console.log("i am calling");

    res.send(leaderboard);
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

app.post("/users", async (req, res) => {
    const user = req.body;
    const query = { email: user.email };
    const existingUser = await usersCollection.findOne(query);
    if (existingUser) {
        return res.send({ message: "User already exists", insertedId: null });
    }
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

app.get("/users/role/:email", verifyToken, async (req, res) => {
    const email = req.params.email;
    if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden access' });
    }
    const user = await usersCollection.findOne({ email });
    res.send({ role: user?.role || 'Normal User' });
});

app.get("/users/:email", verifyToken, async (req, res) => {
    const email = req.params.email;
    if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden access' });
    }
    const user = await usersCollection.findOne({ email }, { projection: { password: 0 } });
    res.send(user);
});

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

app.post("/contests", verifyToken, verifyCreator, async (req, res) => {
    const newContest = req.body;
    const result = await contestsCollection.insertOne(newContest);
    res.status(201).json(result);
});

app.get("/contests/creator/:email", verifyToken, async (req, res) => {
    const email = req.params.email;
    if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden access' });
    }
    const contests = await contestsCollection.find({ creatorEmail: email }).toArray();
    res.send(contests);
});

app.put("/contests/:id", verifyToken, async (req, res) => {
    const id = req.params.id;
    const updatedContest = req.body;
    const filter = { _id: new ObjectId(id), creatorEmail: req.decoded.email, status: 'Pending' };
    const updateDoc = { $set: updatedContest };
    const result = await contestsCollection.updateOne(filter, updateDoc);
    res.send(result);
});

app.delete("/contests/:id", verifyToken, async (req, res) => {
    const id = req.params.id;
    const filter = { _id: new ObjectId(id), creatorEmail: req.decoded.email, status: 'Pending' };
    const result = await contestsCollection.deleteOne(filter);
    res.send(result);
});

app.get("/contests/approved", async (req, res) => {
    const { type } = req.query;
    let query = { status: 'Confirmed' };
    if (type && type !== 'All') {
        query.type = type;
    }
    const contests = await contestsCollection.find(query).sort({ participantsCount: -1 }).toArray();
    res.send(contests);
});

app.get("/contests/popular", async (req, res) => {
    try {
        const popularContests = await contestsCollection.find({ status: 'Confirmed' })
            .sort({ participantsCount: -1 })
            .limit(6)
            .toArray();
        res.send(popularContests);
    } catch (error) {
        console.error("Error fetching popular contests:", error);
        res.status(500).send({ message: "Failed to fetch popular contests" });
    }
});

app.get("/contests/:id", verifyToken, async (req, res) => {
    const id = req.params.id;
    const contest = await contestsCollection.findOne({ _id: new ObjectId(id) });
    res.send(contest);
});

app.get("/contests/all", verifyToken, verifyAdmin, async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const contests = await contestsCollection.find().skip(skip).limit(limit).toArray();
    const totalCount = await contestsCollection.countDocuments();
    res.send({ contests, totalCount });
});

app.patch("/contests/status/:id", verifyToken, verifyAdmin, async (req, res) => {
    const id = req.params.id;
    const { status } = req.body;
    const updateDoc = { $set: { status } };
    const result = await contestsCollection.updateOne({ _id: new ObjectId(id) }, updateDoc);
    res.send(result);
});

// -------------------------------------------------
// 4. Participation/Payment Endpoints
// -------------------------------------------------

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

app.post("/participated", verifyToken, async (req, res) => {
    const participationInfo = req.body;

    const result = await participatedCollection.insertOne(participationInfo);

    await contestsCollection.updateOne(
        { _id: new ObjectId(participationInfo.contestId) },
        { $inc: { participantsCount: 1 } }
    );

    await usersCollection.updateOne(
        { email: participationInfo.participantEmail },
        { $inc: { participatedCount: 1 } }
    );

    res.send(result);
});

app.get("/participated/:email", verifyToken, async (req, res) => {
    const email = req.params.email;
    if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden access' });
    }
    const participatedList = await participatedCollection.find({ participantEmail: email }).toArray();

    const contestIds = participatedList.map(p => new ObjectId(p.contestId));
    const contestsDetails = await contestsCollection.find({ _id: { $in: contestIds } }).toArray();

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

app.post("/submissions", verifyToken, async (req, res) => {
    const submissionInfo = req.body;

    const isRegistered = await participatedCollection.findOne({
        contestId: submissionInfo.contestId,
        participantEmail: submissionInfo.participantEmail
    });

    if (!isRegistered) {
        return res.status(403).send({ message: 'User has not registered for this contest.' });
    }

    const user = await usersCollection.findOne({ email: submissionInfo.participantEmail });
    submissionInfo.participantName = user?.name || 'Unknown User';

    const result = await submissionsCollection.insertOne(submissionInfo);
    res.send(result);
});

app.get("/submissions/creator/:email", verifyToken, verifyCreator, async (req, res) => {
    const creatorEmail = req.params.email;
    const contestIdFilter = req.query.contestId;

    let contestQuery = { creatorEmail };
    if (contestIdFilter) {
        contestQuery._id = new ObjectId(contestIdFilter);
    }
    const creatorContests = await contestsCollection.find(contestQuery).toArray();
    const contestIds = creatorContests.map(c => c._id.toString());

    const submissions = await submissionsCollection.find({
        contestId: { $in: contestIds }
    }).toArray();

    const mergedSubmissions = submissions.map(sub => {
        const contest = creatorContests.find(c => c._id.toString() === sub.contestId);
        return {
            ...sub,
            contestName: contest?.name || sub.contestName
        };
    });

    res.send(mergedSubmissions);
});

// -------------------------------------------------
// 6. Winner Declaration Endpoints
// -------------------------------------------------

app.put("/contests/declare-winner/:id", verifyToken, verifyCreator, async (req, res) => {
    const id = req.params.id;
    const { winnerEmail, submissionId } = req.body;

    const contest = await contestsCollection.findOne({ _id: new ObjectId(id) });
    if (!contest || contest.creatorEmail !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden or Contest not found' });
    }

    if (new Date() < new Date(contest.deadline) || contest.winner) {
        return res.status(400).send({ message: 'Contest must be ended and winner not declared.' });
    }

    const winnerUser = await usersCollection.findOne({ email: winnerEmail });
    if (!winnerUser) {
        return res.status(404).send({ message: 'Winner user not found' });
    }

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
                status: 'Closed'
            }
        }
    );

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

app.get("/contests/winner/:email", verifyToken, async (req, res) => {
    const email = req.params.email;
    if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden access' });
    }
    const winningContests = await contestsCollection.find({ 'winner.email': email }).toArray();
    res.send(winningContests);
});

// =======================================================
// SERVER START
// =======================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

export default app;