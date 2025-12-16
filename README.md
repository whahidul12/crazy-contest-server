# 🛡️ Crazy Contest API: Secure & Scalable Contest Management Server

**Server GitHub Repo:** [Click here for Backend 👈](https://github.com/whahidul12/crazy-contest-server)

**Client GitHub Repo:** [Click here for FrontEnd 👈](https://github.com/whahidul12/crazy-contest-client)

This repository contains the backend API for the Crazy Contest platform. It is built using Node.js and Express, designed for robustness, security, and scalability, handling all data persistence, authentication, authorization, and payment processing.

---

### 🔑 Key Architectural Decisions

1.  **Mongoose-less MongoDB:** Utilized the native **MongoDB** driver (MongoClient) for direct database interaction, ensuring high performance and control over queries (e.g., complex aggregation pipelines for calculating `winPercentage`).
2.  **Vercel Deployment Optimization:** Implemented specific database connection logic to handle the stateless environment of **Vercel**, guaranteeing efficient and reliable connection management.
3.  **Role-Based Access Control (RBAC):** Custom Express middleware (`verifyToken`, `verifyAdmin`, `verifyCreator`) protects all private routes, enforcing least-privilege access and secure operations across the Admin, Creator, and User dashboards.
4.  **Secure Payment Gateway (Stripe):** Integrated the **Stripe API** for secure checkout and a dedicated webhook/verification endpoint to handle post-payment processing, atomically updating user and contest participation counts.
5.  **Dynamic Querying & Pagination:** The `/contests/approved` endpoint supports complex querying with **filtering by type**, **searching by name/creator**, and efficient **server-side pagination** (using `$skip` and `$limit` in MongoDB) within a single API call.

---

### 🌐 API Endpoints Summary

| Endpoint                       | Method | Role    | Description                                                                                                |
| :----------------------------- | :----- | :------ | :--------------------------------------------------------------------------------------------------------- |
| `/jwt`                         | POST   | Public  | Generates and sends a JWT access token upon successful login.                                              |
| `/users`                       | POST   | Public  | Registers a new user with a default 'Normal User' role.                                                    |
| `/users/role/:email`           | GET    | User    | Checks the user's role for dashboard routing.                                                              |
| `/users/leaderboard`           | GET    | Public  | Returns the top users ranked by `wins` count for the leaderboard.                                          |
| `/contests/approved`           | GET    | Public  | Fetches paginated, filtered, and searchable list of confirmed contests.                                    |
| `/contests`                    | POST   | Creator | Submits a new contest for admin approval (status: 'Pending').                                              |
| `/contests/creator/:email`     | GET    | Creator | Retrieves all contests created by the authenticated creator (for Creator Dashboard).                       |
| `/contests/all`                | GET    | Admin   | Fetches all contests (paginated) for Admin management (Confirm/Reject/Delete).                             |
| `/contests/status/:id`         | PATCH  | Admin   | Updates the status of a contest (Confirm/Reject).                                                          |
| `/create-checkout-session`     | POST   | User    | Initiates a Stripe checkout session for contest payment.                                                   |
| `/verify-payment`              | POST   | User    | Verifies successful Stripe payment, records participation, and increments counts.                          |
| `/submissions`                 | POST   | User    | Allows registered users to submit their task links/details.                                                |
| `/submissions/creator/:email`  | GET    | Creator | Retrieves all submissions related to the creator's contests.                                               |
| `/contests/declare-winner/:id` | PUT    | Creator | Declares a winner, updates contest status, and atomically updates the winner's `wins` and `winPercentage`. |

---

### 💻 Technology Stack (Backend)

| Category       | Technologies             | Description                                                       |
| :------------- | :----------------------- | :---------------------------------------------------------------- |
| **Runtime**    | **Node.js**              | JavaScript runtime environment.                                   |
| **Framework**  | **Express.js**           | Minimalist framework for building the RESTful API.                |
| **Database**   | **MongoDB**              | NoSQL database for data persistence.                              |
| **Security**   | **JSON Web Token (JWT)** | Used for secure API access and authorization.                     |
| **Payment**    | **Stripe API**           | Handles secure collection and processing of entry fees.           |
| **Deployment** | **Vercel**               | Serverless platform for deploying the Express application.        |
| **Utilities**  | **Dotenv, Cors**         | Managing environment variables and cross-origin resource sharing. |

---

### ⚙️ Installation and Setup

**Prerequisites:** Node.js (v18+), MongoDB Atlas Account.

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/whahidul12/crazy-contest-server
    cd crazy-contest-server
    ```

2.  **Install dependencies:**

    ```bash
    npm install
    ```

3.  **Configure Environment Variables:**
    Create a `.env` file in the root directory. **Ensure these values are kept secret.**

    ```env
    PORT=3000
    DB_URI="mongodb+srv://<user>:<password>@cluster.mongodb.net/contest_craze_db?retryWrites=true&w=majority"
    ACCESS_TOKEN_SECRET="A_VERY_LONG_AND_COMPLEX_SECRET_KEY_FOR_JWT"
    STRIPE_SICRET="sk_live_or_test_key_from_stripe"
    DOMAIN_URL=https://contest-craze-app.web.app
    ```

4.  **Run the application:**
    ```bash
    npm start
    ```
    The API server will start running on the configured port (e.g., `http://localhost:3000`).
