# Pathfinder

A comprehensive project with a modern architecture separating backend and frontend services.

## Project Structure

```
pathfinder/
├── src/
│   ├── backend/          # Backend services and API
│   │   ├── src/
│   │   ├── tests/
│   │   ├── package.json
│   │   └── README.md
│   ├── frontend/         # Frontend application
│   │   ├── src/
│   │   ├── public/
│   │   ├── package.json
│   │   └── README.md
│   └── shared/           # Shared utilities and types (optional)
├── docs/                 # Documentation
├── .gitignore
└── README.md
```

## Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn package manager

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/bikemaster2331/pathfinder.git
   cd pathfinder
   ```

2. **Install backend dependencies**
   ```bash
   cd src/backend
   npm install
   ```

3. **Install frontend dependencies**
   ```bash
   cd ../frontend
   npm install
   ```

## Development

### Running the Backend
```bash
cd src/backend
npm start
```

### Running the Frontend
```bash
cd src/frontend
npm start
```

## Project Features

- **Modular Architecture**: Separated backend and frontend for independent development and deployment
- **Scalable Structure**: Clear directory organization for easy navigation and maintenance
- **Shared Resources**: Optional shared utilities between frontend and backend

## Contributing

Please read [CONTRIBUTING.md](./docs/CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For questions and support, please open an issue in the GitHub repository.
