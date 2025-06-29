# Managarr

A modern media management application for automating cleanup and organization of your Sonarr and Radarr libraries.

## Features

- **Smart Deletion Rules**: Create custom rules to automatically manage your media library
- **Media Server Integration**: Full integration with Sonarr and Radarr APIs
- **Storage Overview**: Real-time disk space monitoring and analytics
- **Advanced Analytics**: Media age distribution, type breakdown, and usage statistics
- **Optimized Performance**: Modern React interface with virtualized tables for large datasets
- **Safety First**: Pending deletion system - review before any files are actually deleted

## Tech Stack

- **Frontend**: React 18, Material-UI, DataGrid for performance
- **Backend**: Node.js, Express, Sequelize ORM
- **Database**: SQLite (configurable to PostgreSQL/MySQL)
- **Integration**: Sonarr v3, Radarr v3 APIs

## Quick Start

### Docker (Recommended)

```bash
docker run -d \
  --name managarr \
  -p 3000:3000 \
  -v /path/to/config:/app/config \
  -v /path/to/media:/media \
  managarr:latest
```

### Docker Compose

```yaml
version: '3.8'
services:
  managarr:
    image: managarr:latest
    container_name: managarr
    ports:
      - "3000:3000"
    volumes:
      - ./config:/app/config
      - /path/to/media:/media
    environment:
      - NODE_ENV=production
    restart: unless-stopped
```

### Manual Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/managarr.git
cd managarr

# Install dependencies
npm install

# Start backend
cd backend && npm start &

# Start frontend
cd frontend && npm start
```

## Configuration

1. Access the web interface at `http://localhost:3000`
2. Go to Settings → Integrations
3. Configure your Sonarr and Radarr connections
4. Create deletion rules in the Rules section

## Usage

### Creating Deletion Rules

1. Navigate to "Deletion Rules"
2. Click "Create Rule"
3. Configure conditions (age, watch status, quality, etc.)
4. Preview affected media before saving
5. Enable the rule and set schedule

### Media Management

- View all your TV shows and movies in the Media Manager
- Search, filter, and sort your library
- Protect important media from deletion
- Bulk operations for efficient management

### Storage Monitoring

- Real-time disk space tracking
- Identify storage usage by media type
- Monitor library growth over time

## API Integration

Managarr integrates with:
- **Sonarr v3**: Series management, episode tracking
- **Radarr v3**: Movie management, quality profiles

## Safety Features

- **Pending Deletions**: Review all deletion candidates before execution
- **Protected Media**: Mark important content as protected
- **Dry Run Mode**: Test rules without making changes
- **Audit Logging**: Track all deletion activities

## Development

### Prerequisites

- Node.js 16+
- npm or yarn

### Setup

```bash
# Install dependencies
npm install

# Start development servers
npm run dev
```

### Building

```bash
# Build frontend
cd frontend && npm run build

# Build backend
cd backend && npm run build
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- Create an issue for bug reports
- Check existing issues before submitting
- Provide detailed information about your setup

## Roadmap

- [ ] Plex integration for watch status
- [ ] Advanced analytics dashboard
- [ ] Mobile-responsive design
- [ ] Multi-user support
- [ ] Custom notification system
- [ ] Backup/restore functionality