![Artifax](frontend/src/assets/ReadmeImg/Artifax.png)

### Table Of Contents
- [Overview](#overview)
- [Installation](#installation)
- [Usage Guide](#usage-guide)
- [Additional Mockups](#additional-mockups)
- [Test Coverage](#test-coverage)
- [Changes Since Submission](#changes-since-submission)
- [Technologies used](#technologies-used)
- [Acknowledgements](#acknowledgements)
## Overview

The purpose of this project report is to present the completed application for the simple and highly reliable inventory management system, Artifax. Developed to avoid unnecessary complication, the system provides a direct approach to tracking internal warehouse operations focusing entirely on internal warehouse components rather than external factors.

The core objective of the system is to deliver a highly scalable backend architecture capable of managing inventory quantities across at least two distinct locations. It enables the tracking of base materials and crafted items, manages production timelines and facilitates structured role-based access control. The system's development was guided by a distinct set of operational needs and analytical wants outlined during initial consultations.


## Installation

<table>
<tr>


### Step 1:
Go to the [Artifax Releases](https://github.com/I-Know-What-You-Committed-Last-Summer/Artifax/releases) page on GitHub and select the **latest version**.

### Step 2:
Download the **`Artifax-win32-x64.zip`** asset.

### Step 3:
Extract (unzip) the contents of the downloaded ZIP file to your preferred directory.

### Step 4:
Open the extracted folder and run **`Artifax.exe`** to launch the application.


</tr>
</table>
   
## Usage Guide

<table width="100%">
  <tr>
    <td width="50%" align="center">
      <img src="frontend/src/assets/ReadmeImg/Dash.png" alt="Dashboard">
    </td>
    <td width="50%">
      <h3>Dashboard</h3>
      <p>The dashboard provides users with a simplified overview of the inventory, featuring clear labels for low-stock alerts. It also displays currently active jobs and tracks orders waiting in the queue for efficient monitoring.</p>
    </td>
  </tr>

  <tr>
    <td width="50%">
      <h3>Inventory</h3>
      <p>The inventory screen displays all stocked items alongside their relevant information. This ensures quick access to essential details for seamless warehouse management.</p>
    </td>
    <td width="50%" align="center">
      <img src="frontend/src/assets/ReadmeImg/Inv.png" alt="Inventory">
    </td>
  </tr>

  <tr>
    <td width="50%" align="center">
      <img src="frontend/src/assets/ReadmeImg/CraftQue.png" alt="Active Jobs & Queue">
    </td>
    <td width="50%">
      <h3>Crafting: Active Jobs & Queue</h3>
      <p>This section displays actively crafting orders and upcoming queued items. Users can easily pause, cancel, or expedite orders to double the crafting speed as needed.</p>
    </td>
  </tr>

  <tr>
    <td width="50%">
      <h3>Crafting: Blueprints</h3>
      <p>On the blueprint screen, users can select specific blueprints to review their material requirements. It also provides options to initiate a craft, edit, or delete existing blueprints from the system.</p>
    </td>
    <td width="50%" align="center">
      <img src="frontend/src/assets/ReadmeImg/CraftItem.png" alt="Blueprints">
    </td>
  </tr>

  <tr>
    <td width="50%" align="center">
      <img src="frontend/src/assets/ReadmeImg/CarftHis.png" alt="Order History">
    </td>
    <td width="50%">
      <h3>Crafting: Order History</h3>
      <p>The order history page logs all previous crafting activities for easy reference. Users can review comprehensive details of both completed and cancelled orders from the past.</p>
    </td>
  </tr>

  <tr>
    <td width="50%">
      <h3>New Blueprint</h3>
      <p>This screen allows users to seamlessly add a completely new blueprint to the system. Existing blueprints can also be edited here to ensure crafting requirements are kept up to date.</p>
    </td>
    <td width="50%" align="center">
      <img src="frontend/src/assets/ReadmeImg/CraftNewBlue.png" alt="New Blueprint">
    </td>
  </tr>

  <tr>
    <td width="50%" align="center">
      <img src="frontend/src/assets/ReadmeImg/AdminAnalitics.png" alt="Analytics">
    </td>
    <td width="50%">
      <h3>Analytics (Admin Only)</h3>
      <p>The analytics dashboard provides administrators with valuable insights into crafted item volumes compared to their base costs. It also highlights the most frequently crafted blueprints to help managers optimise production.</p>
    </td>
  </tr>

  <tr>
    <td width="50%">
      <h3>User Management (Admin Only)</h3>
      <p>Administrators can use this page to add new users or assign admin privileges. It also allows for the easy editing or deletion of current user data to maintain secure access control.</p>
    </td>
    <td width="50%" align="center">
      <img src="frontend/src/assets/ReadmeImg/AdminUsers.png" alt="User Management">
    </td>
  </tr>
</table>



## Test Coverage

### Frontend

We implemented unit and integration testing to verify our frontend code, which resulted in 17 passed and 4 failed test suites out of 21 total, and 35 passed and 4 failed individual tests out of 39 total as shown in image. The 4 failing tests belong to features that are still in production, so they are expected to fail until that development wraps up. 

As seen in image, our current code coverage metrics are 57.39% for Statements, 43.63% for Branches, 56.41% for Functions, and 57.9% for Lines, with the uncovered pages currently being fixed and refactored. For the core features that are completely finished like the components tested in BlueprintPanel.test.tsx, CraftingQueue.test.tsx, and NewBlueprint.test.tsx, the tests thoroughly check that data loads correctly from the backend, form buttons lock when inputs are missing and errors are handled safely. 

### Backend

We wrote unit tests throughout the backend on the majority of our controllers that test the functions we use on our endpoints in isolation. Our test suite was built using xUnit and we used both EF’ In-Memory Database and Moq to run our testing. Our total line coverage is only about 30%, but that number is being dropped significantly by files made by Entity Framework Core and Dotnet. We have especially high coverage on all of our controllers. We wrote 77 tests in total, all passed. Every test we wrote follows the Arrange Act Assert pattern to ensure readability and predictability. The tests primarily validated the Controllers.

This included verifying standard CRUD operations, complex relational updates, and ensuring the API returned the correct HTTP status codes for both working results and bad results. These metrics strongly reflect a robust test suite because the coverage wasn't just superficial. The tests thoroughly explored various execution paths, ensuring that our application correctly manipulates the database state (verifying item counts and property changes post-execution) and accurately maps Data Transfer Objects.

### Technologies
![Jest](https://img.shields.io/badge/-jest-%23C21325?style=for-the-badge&logo=jest&logoColor=white)
![Moq](https://img.shields.io/badge/-Moq-%4623B7?style=for-the-badge)
![xUnit](https://img.shields.io/badge/xUnit-5C2D91?style=for-the-badge&logo=.net&logoColor=white)
![Swagger](https://img.shields.io/badge/-Swagger-%23Clojure?style=for-the-badge&logo=swagger&logoColor=white)
![Insomnia](https://img.shields.io/badge/Insomnia-black?style=for-the-badge&logo=insomnia&logoColor=5849BE)

In terms of testing we employed a suite of technologies in order to engage in various forms of both manual and automatic. This includes:
- Jest and xUnit for automated testing of our frontend and backend applications. These two technologies were also built in additions to react and dotnet.
- Swagger and Insomnia for manual testing of backend during early to mid and later development accordingly.

## Changes Since Submission

After the original project submission, I made the following improvements in this fork:

| Area | At submission | Now |
|---|---|---|
| Test suite | 35 of 39 frontend tests passing; 77 backend tests; ~30% backend line coverage | 336 frontend and 169 backend tests, all passing; 100% backend coverage, 98% frontend (see below) |
| Low-stock alerts | A bug showed every warehouse's low-stock alerts to all warehouses | Each warehouse now only sees its own low-stock alerts |
| Bugs found by the new tests | — | Fixed: queued orders being started repeatedly by the scheduler, inventory edits saving to the wrong branch, dashboard jobs showing "Order N" instead of item names, light theme not being remembered, and more |

The Test Coverage figures above describe the project as it was at submission.

### Test coverage now

| | Tests | Lines | Branches | Functions / methods |
|---|---|---|---|---|
| Backend (xUnit) | 169 passed, 0 failed | 100% | 100% | 100% |
| Frontend (Jest) | 336 passed, 0 failed | 98.5% | 92.3% | 98.6% |

**What's measured.** Coverage only counts code that's part of the application:
- **Backend:** excludes EF Core migrations, generated code under `obj/`, and compiler-generated members such as auto-properties. See `Backend.Tests/coverlet.runsettings`.
- **Frontend:** covers the code that calls the backend or works with its data, in both styles the project uses: `services/` and components that fetch data themselves. It excludes entry files, static data and config, purely presentational components, and unused files. See `jest.collectCoverageFrom` in `frontend/package.json`.

The frontend run fails if any metric drops below 80%.

**How it's tested.**
- **Backend:** unit tests per controller, with positive and negative cases (success, not found, unauthorized, bad request, conflict) against an in-memory database. Tests for the background order scheduler. Integration tests that boot the real app with `WebApplicationFactory` to cover startup, CORS, sessions and configuration.
- **Frontend:** tests check that backend data appears correctly, including empty and error states, and that actions send the right requests. All backend data is mocked: axios is replaced by `src/__mocks__/axios.js`, with shared fixtures in `src/test-utils/`.

**Running the tests**
```powershell
# Backend (stop the running API first; it locks the build output)
dotnet test Backend.Tests --settings Backend.Tests/coverlet.runsettings --collect:"XPlat Code Coverage"
reportgenerator -reports:"Backend.Tests/TestResults/<run-id>/coverage.cobertura.xml" -targetdir:coveragereport-fork -reporttypes:Html

# Frontend
cd frontend
npm run test:coverage    # report: frontend/coverage/lcov-report/index.html
```

The original team report is kept in `coveragereport/` for comparison. This fork's backend report is in `coveragereport-fork/`.

### Future Improvements
- **Act on low-stock alerts directly:** click an alert to restock the item or start a craft.
- **Better profile and admin account management.**
- **Client-led iteration:** more rounds of client feedback and usability testing with warehouse staff, treating Artifax as a live product.

## Technologies used

The following section outlines all the technologies used for development and deployment of Artifax. 

---

### Frontend Technologies
![NodeJS](https://img.shields.io/badge/node.js-6DA55F.svg?style=for-the-badge&logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)
![React Router](https://img.shields.io/badge/React_Router-CA4245?style=for-the-badge&logo=react-router&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white)
![DaisyUI](https://img.shields.io/badge/daisyui-5A0EF8?style=for-the-badge&logo=daisyui&logoColor=white)
![Figma](https://img.shields.io/badge/figma-%23F24E1E.svg?style=for-the-badge&logo=figma&logoColor=white)
![PostCSS](https://img.shields.io/badge/PostCSS-%23DD3A0A.svg?style=for-the-badge&logo=postcss&logoColor=white)
![Chart.js](https://img.shields.io/badge/chart.js-F5788D.svg?style=for-the-badge&logo=chart.js&logoColor=white)

- **Node.JS** - Node.js is a powerful runtime environment that allows developers to run JavaScript on the server side, letting you build fast and scalable backend applications outside of a web browser.
- **React** - The foundational JavaScript library used for building the user interface.
- **React Router** - The standard routing library for React. It enables navigation between different pages/views in a Single Page Application (SPA) without reloading the page.
- **Axios** - A promise-based HTTP client used to send requests to backend APIs to fetch, send, or update data.
- **TailwindCSS** - Tailwind CSS is a utility-first CSS framework that allows you to build custom website designs incredibly fast by applying pre-made style classes directly inside your HTML or JSX components.
- **DaisyUI** - A popular component library plugin for Tailwind CSS. It provides ready to use components like buttons, modals, and cards so you don't have to write raw utility classes for everything.
- **PostCSS** - Build tools that work behind the scenes with Tailwind to compile your CSS and automatically add browser vendor prefixes  for cross-browser compatibility.
- **Chart.JS** - A popular JavaScript library used to render flexible, responsive charts (bar, line, pie charts, etc.).
- **Figma** - Figma is a collaborative, cloud based design tool used by product teams to create user interfaces, wireframes, and interactive prototypes for websites and mobile applications in real-time.

---

### Backend Technologies
![.Net](https://img.shields.io/badge/.NET-5C2D91?style=for-the-badge&logo=.net&logoColor=white)
![Postgres](https://img.shields.io/badge/postgres-%23316192.svg?style=for-the-badge&logo=postgresql&logoColor=white)

- **ASP .Net** - .Net was the underlying technology for the establishment of the application’s backend api. It provides us with enterprise level tools that can scale with our growing needs.
    - **Entity Framework Core** - EF Core was primarily used for its ability to connect our application to our database on top of its various relationship modeling tools and migration system.
- **Postgres** - Postgres was the primary tool for creating and modelling our database as it is a highly reliable, open-source object-relational database management system.

---

### Deployment Technologies
![Render](https://img.shields.io/badge/Render-%46E3B7.svg?style=for-the-badge&logo=render&logoColor=white)
![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)
![Electron.js](https://img.shields.io/badge/Electron-191970?style=for-the-badge&logo=Electron&logoColor=white)

- **Docker** - Docker packages applications and their dependencies into standardized, isolated containers. These container could then be passed along to our Render server.
- **Render** - Render is our cloud platform of choice which we used to build and deploy our api contained within our docker application.
- **Electron** - Electron is used for the deployment of the web app in the form of a sharable executable application. 

## Creators

<a href="https://github.com/I-Know-What-You-Committed-Last-Summer/Artifax/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=I-Know-What-You-Committed-Last-Summer/Artifax" />
</a>

## Acknowledgements
![GitHub Copilot](https://img.shields.io/badge/github_copilot-8957E5?style=for-the-badge&logo=github-copilot&logoColor=white)
![Google Gemini](https://img.shields.io/badge/google%20gemini-8E75B2?style=for-the-badge&logo=google%20gemini&logoColor=white)
![Stack Overflow](https://img.shields.io/badge/-Stackoverflow-FE7A16?style=for-the-badge&logo=stack-overflow&logoColor=white)

Lastly we would like to acknowledge the following people and resources that aided in the creation of the application:

- [Tsungai Katsuro](https://github.com/TsungaiKats)
- William Basson
- Simba Zengeni
- Stack Overflow Community
- Github Copilot
- Google Gemini
