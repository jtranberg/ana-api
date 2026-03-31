# 🏢 Real Estate Syndicator Engine

![Build](https://img.shields.io/badge/build-passing-brightgreen)
![Coverage](https://img.shields.io/badge/coverage-tested-blue)
![Tests](https://img.shields.io/badge/tests-21%2B-success)
![Suites](https://img.shields.io/badge/suites-6-informational)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6)
![Node](https://img.shields.io/badge/node-%3E%3D18-339933)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

A production-grade data syndication engine that transforms property and unit data into standardized feeds for external platforms such as **Apartments.com** and **Liv.Rent**.

Built with a focus on **data integrity, availability accuracy, and reliable feed delivery**.

---

## 🚀 Overview

This system ingests raw property and unit data, normalizes it into a canonical structure, applies validation and availability logic, and outputs structured XML feeds for third-party listing platforms.

It is designed to:

- Prevent invalid or incomplete listings  
- Ensure accurate availability filtering  
- Provide consistent, partner-ready feed formats  
- Support secure, authenticated feed access  
- Scale across multiple listing platforms  

---

## ⚙️ Core Features

### 🧠 Canonical Data Pipeline
- Normalizes external data into a unified schema  
- Handles fallback logic (e.g., property → unit fields)  
- Decouples source data from feed generation  

---

### 📅 Availability Engine
- Determines real-time availability based on:
  - explicit availability flags  
  - availability dates  
- Prevents future or invalid units from being published  

---

### ✅ Validation Layer
- Ensures only publishable units are included  
- Automatically blocks:
  - missing property references  
  - missing rent values  
- Tracks blocked vs published records  

---

### 🧾 Feed Generation
- Generates XML feeds for:
  - Apartments.com (MITS format)  
  - Liv.Rent  
- Includes:
  - record counts  
  - blocked counts  
  - structured property + unit data  

---

### 🔐 Authentication
- Protected feed endpoints (Basic Auth)  
- Prevents unauthorized access to partner feeds  

---

GET /feeds/apartments/full.xml


### Liv Rent Feed (Protected)

GET /feeds/liv-rent.xml
Authorization: Basic Auth required


Optional query:

?available=true


Returns only currently available units.

---

## 🧪 Test Suite

This project includes a full **Jest + Supertest** test suite covering core business logic and API behavior.

### ✅ Unit Tests
- Availability logic (`isAvailableNow`)  
- Validation rules (`validateUnit`)  
- Normalization fallback behavior  

### 🔌 Integration Tests
- Feed endpoints return valid XML  
- Availability filtering works end-to-end  
- Canonical data service is invoked correctly  

### 🔐 Authentication Tests
- Unauthorized requests are rejected  
- Authorized requests succeed  

### 📊 Test Coverage

- **6 test suites**  
- **21+ test cases**  
- Covers:
  - business logic  
  - API behavior  
  - auth enforcement  
  - data transformation  

Run tests:

```bash
npm test

Node.js + Express
TypeScript
Jest + Supertest
XML generation utilities
Modular service architecture
🧠 Design Principles
Deterministic outputs
Tests do not depend on live external data
Separation of concerns
Data → normalization → validation → feed generation
Fail-safe validation
Invalid data is blocked, not published
Test-driven confidence
Core logic and endpoints are protected by tests
Production-ready structure
Designed for scalability and multi-platform expansion
📈 Real-World Impact

This system is designed to:

Reduce manual listing management work
Prevent missed rental opportunities
Improve data consistency across platforms
Enable scalable listing syndication
Increase reliability of external feed integrations
🔮 Future Enhancements
Additional platform integrations (Zillow, Rentals.ca, etc.)
Feed scheduling and caching
Admin dashboard for feed monitoring
XML schema validation
CI/CD pipeline with automated testing
🧑‍💻 Author

Built as part of a real-world property management and syndication platform.

📜 License

MIT