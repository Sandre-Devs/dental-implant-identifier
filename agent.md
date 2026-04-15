# OpenClaude Agent for DII Project

## Overview
This document describes how the OpenClaude agent can assist with development tasks in the Dental Implant Identifier (DII) project. The agent helps with code navigation, file modifications, debugging, and implementing features while following project conventions.

## Capabilities
- **Code Navigation**: Quickly find files, functions, and route definitions
- **File Editing**: Make precise changes to existing files with proper formatting
- **Code Generation**: Create new files following project patterns and conventions
- **Debugging Assistance**: Help identify issues and suggest fixes
- **Documentation**: Generate and update documentation like this file
- **Refactoring**: Assist with code improvements while maintaining functionality

## Usage in this Project
Common operations the agent can help with in the DII project:

### Backend Development
- Reading and modifying route files in `/routes/`
- Updating controller logic and database queries
- Working with JWT authentication middleware
- Modifying file upload and image processing logic
- Updating ML inference service interactions

### Database Operations
- Reading and modifying SQL queries in route files
- Understanding the SQLite schema in `/database/schema.sql`
- Assisting with migration scripts and seed data

### Frontend-related Tasks
- While the frontend is built separately, the agent can help with API contracts
- Understanding the expected data formats for endpoints

### Maintenance Tasks
- Updating documentation (like this README)
- Adding new endpoints following existing patterns
- Modifying validation rules and error handling

## Project-Specific Tips
### Working with Authentication
- Most API routes require JWT authentication via `requireAuth` middleware
- Role-based access control uses `requireRole('admin')`, `requireRole('reviewer')`, etc.
- Tokens are typically handled in the Authorization header as Bearer tokens

### File Uploads and Images
- Uploads are handled via Multer with Sharp for image processing
- Files are stored in `/uploads/` directory with randomized filenames
- Original filenames are anonymized using SHA-256 for LGPD compliance
- Image metadata (width, height) is extracted during upload

### ML Inference Service
- Inference runs in background after image upload via `detectAndSave` function
- Results are saved to the annotations table
- The service uses TensorFlow.js models for implant detection

### Database Patterns
- SQLite database accessed via `better-sqlite3` wrapper
- Parameterized queries using `.prepare()` and `.run()`/`get()`/`all()` methods
- Timestamps typically use SQLite's `datetime('now')` function
- Soft deletes are used for users (active=0) and some other entities

## Example Commands
Here are some examples of how you might interact with the OpenClaude agent for DII project tasks:

```
# Find all route files
/agent Find all files in the routes directory

# Read a specific route file
/agent Read the images.js route file to understand upload endpoints

# Search for authentication patterns
/agent Search for JWT verification patterns in middleware

# Create a new endpoint
/agent Create a new GET endpoint in manufacturers.js that returns active systems only

# Update documentation
/agent Update the README.md endpoints table with the latest routes

# Debug an issue
/agent Help me understand why image uploads might be failing validation
```

## Getting Started
To use the OpenClaude agent effectively in this project:
1. Start with general questions about the codebase structure
2. Use specific file paths when you know what you're looking for
3. Reference line numbers when discussing specific code sections
4. Ask for clarification on project conventions when needed

The agent is here to assist with development tasks while you maintain control over the direction and decisions.