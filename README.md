# UNIFIEDTKD — Firebase Admission System

This application connects the UNIFIEDTKD website admission form directly to Cloud Firestore and provides a secure admin dashboard without requiring Firebase Cloud Functions or the Blaze billing plan.

## Architecture

- **Public Admission Form** (`public/index.html`):
  - Preserves the existing UNIFIEDTKD landing page design.
  - Submits applicant data directly to Cloud Firestore collection `applications`.
  - Saves student name, email, phone, selected branch, age, height, notes, timestamp (`createdAt`), and initial status (`Pending`).
  - Displays the exact confirmation: `“Your application is sent, thank you for applying and you will get a confirmation email.”`
- **Admin Dashboard** (`public/admin.html`):
  - Firebase Authentication with Email/Password login.
  - Restricts dashboard access to `bakredivyesh@gmail.com`.
  - Displays application statistics (Total, Pending, Approved, Rejected).
  - Search and filter applications by status.
  - Interactive **Approve** and **Reject** buttons to update application statuses in Firestore.
- **Security Rules** (`firestore.rules`):
  - Public users can only create new applications with valid inputs and status `Pending`.
  - Public users cannot read, list, update, or delete any application.
  - Only authenticated admin `bakredivyesh@gmail.com` can read, update, or delete applications.

## Prerequisites

1. **Enable Cloud Firestore**:
   In the Firebase Console for project `taekwondokanishka`, ensure Cloud Firestore is created.
2. **Enable Email/Password Authentication**:
   In Firebase Console -> **Build** -> **Authentication** -> **Sign-in method**, enable **Email/Password**.
3. **Create the Admin User**:
   In Firebase Console -> **Authentication** -> **Users**, add a user with email `bakredivyesh@gmail.com` and set a secure password.

## Deployment Commands

Deploy both Firestore security rules and Firebase Hosting with:

```sh
firebase deploy --only firestore:rules,hosting
```

Or deploy individually:

```sh
firebase deploy --only hosting
firebase deploy --only firestore:rules
```

## Live URLs

- **Public Website**: `https://taekwondokanishka.web.app` or `https://taekwondokanishka.firebaseapp.com`
- **Admin Dashboard**: `https://taekwondokanishka.web.app/admin.html`
