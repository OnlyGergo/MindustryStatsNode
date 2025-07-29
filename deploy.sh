#!/bin/bash

# Mindustry Stats Microservices Deployment Script
# This script handles building, installing dependencies, and deploying all microservices

set -e  # Exit on any error

echo "🚀 Starting Mindustry Stats Microservices Deployment"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if required tools are installed
check_dependencies() {
    print_status "Checking dependencies..."

    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        exit 1
    fi

    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed"
        exit 1
    fi

    if ! command -v pm2 &> /dev/null; then
        print_warning "PM2 is not installed. Installing globally..."
        npm install -g pm2
    fi

    print_success "All dependencies are available"
}

# Install project dependencies
install_dependencies() {
    print_status "Installing project dependencies..."
    cd backend
    npm install
    cd ..
    print_success "Dependencies installed"
}

# Build the project
build_project() {
    print_status "Building TypeScript project..."
    cd backend
    npm run build
    cd ..
    print_success "Project built successfully"
}

# Create necessary directories
create_directories() {
    print_status "Creating necessary directories..."
    mkdir -p backend/logs
    print_success "Directories created"
}

# Copy environment configuration
setup_environment() {
    print_status "Setting up environment configuration..."
    cd backend

    if [ ! -f .env ]; then
        if [ -f .env.example ]; then
            cp .env.example .env
            print_warning "Created .env file from .env.example. Please update it with your configuration."
        else
            print_error ".env.example file not found"
            exit 1
        fi
    else
        print_success "Environment file already exists"
    fi

    cd ..
}

# Check database connectivity
check_database() {
    print_status "Checking database connectivity..."
    # This would typically include a database connection test
    # For now, we'll just print a reminder
    print_warning "Please ensure PostgreSQL is running and accessible"
    print_warning "Please ensure TimescaleDB extension is installed"
}

# Check Valkey/Redis connectivity
check_valkey() {
    print_status "Checking Valkey/Redis connectivity..."
    # This would typically include a Valkey connection test
    # For now, we'll just print a reminder
    print_warning "Please ensure Valkey/Redis is running and accessible"
}

# Deploy services with PM2
deploy_services() {
    print_status "Deploying microservices with PM2..."
    cd backend

    # Stop existing services if running
    pm2 delete ecosystem.config.json 2>/dev/null || true

    # Start all services
    pm2 start ecosystem.config.json

    # Save PM2 configuration
    pm2 save

    # Setup PM2 startup script
    pm2 startup

    cd ..
    print_success "Microservices deployed successfully"
}

# Show service status
show_status() {
    print_status "Current service status:"
    pm2 status

    echo ""
    print_status "Service logs location: backend/logs/"
    print_status "Use 'npm run pm2:logs' to view live logs"
    print_status "Use 'npm run pm2:monit' to monitor services"
}

# Main deployment flow
main() {
    echo "=================================================="
    echo "🎯 Mindustry Stats Microservices Deployment"
    echo "=================================================="

    check_dependencies
    create_directories
    install_dependencies
    build_project
    setup_environment
    check_database
    check_valkey
    deploy_services
    show_status

    echo ""
    print_success "🎉 Deployment completed successfully!"
    echo ""
    echo "Services:"
    echo "  - Server Discovery:    Manages server list updates"
    echo "  - Server Collector:    Queries individual Mindustry servers"
    echo "  - Server Processor:    Processes data and manages cache"
    echo "  - API Service:         REST API endpoints (port 3000)"
    echo "  - WebSocket Service:   Real-time updates (port 3001)"
    echo ""
    echo "Next steps:"
    echo "  1. Update backend/.env with your database and Valkey credentials"
    echo "  2. Run database migrations if needed"
    echo "  3. Monitor services with: npm run pm2:monit"
    echo ""
}

# Handle script arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "build")
        build_project
        ;;
    "start")
        deploy_services
        ;;
    "stop")
        cd backend && npm run pm2:stop
        ;;
    "restart")
        cd backend && npm run pm2:restart
        ;;
    "status")
        show_status
        ;;
    "logs")
        cd backend && npm run pm2:logs
        ;;
    *)
        echo "Usage: $0 {deploy|build|start|stop|restart|status|logs}"
        exit 1
        ;;
esac
