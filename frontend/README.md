# Frontend Application Documentation

Next.js 14 frontend application for the Data Analysis Platform.

## Quick Start

### 1. Prerequisites

- Node.js 18+ 
- npm or yarn package manager

### 2. Installation

```bash
# Install dependencies
npm install

# Or with yarn
yarn install
```

### 3. Environment Configuration

Create a `.env.local` file in the frontend directory:

```env
# Backend API URL
NEXT_PUBLIC_BACKEND_URL=http://localhost:4700

# WebSocket URL for real-time updates
NEXT_PUBLIC_WS_URL=ws://localhost:4700

# Optional: Custom port (defaults to 4800)
PORT=4800
```

### 4. Development Server

```bash
# Start development server
npm run dev

# Or with yarn
yarn dev
```

The application will be available at `http://localhost:4800` (or the next available port).

### 5. Production Build

```bash
# Build for production
npm run build

# Start production server
npm start

# Or with yarn
yarn build
yarn start
```

## Project Structure

```
frontend/
├── app/                    # Next.js App Router pages
│   ├── admin/             # Admin dashboard pages
│   ├── dashboard/         # Main user dashboard
│   ├── projects/          # Project management pages
│   ├── public/            # Public project viewing
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Home page
├── components/            # Reusable React components
│   ├── ui/               # UI component library
│   ├── ImageGallery.tsx  # Image display component
│   └── PublicImageGallery.tsx
├── lib/                   # Utility libraries
│   ├── auth.tsx          # Authentication context
│   ├── query-provider.tsx # React Query setup
│   ├── socket.tsx        # WebSocket context
│   └── utils.ts          # Utility functions
├── public/                # Static assets
├── package.json           # Dependencies and scripts
├── tailwind.config.ts     # Tailwind CSS configuration
├── tsconfig.json          # TypeScript configuration
└── next.config.js         # Next.js configuration
```

## Key Features

### Authentication System

The application supports three types of users:

1. **Registered Users**: Full account with email/password
2. **Guest Users**: Temporary access with full functionality
3. **Admin Users**: Administrative privileges

#### Authentication Flow

```typescript
// Login
const loginMutation = useMutation({
  mutationFn: async (credentials) => {
    const response = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    })
    return response.json()
  }
})

// Guest Access
const guestMutation = useMutation({
  mutationFn: async () => {
    const response = await fetch('/api/v1/auth/guest', {
      method: 'POST'
    })
    return response.json()
  }
})
```

### Project Management

#### Dashboard Features

- **Project Creation**: Create new analysis projects
- **Project Listing**: View all accessible projects
- **Project Statistics**: Display project and run counts
- **Recent Runs**: Show latest analysis runs
- **Real-time Updates**: Live status updates via WebSocket

#### Project Page Features

- **File Upload**: Upload CSV data and JSL scripts
- **Run Management**: Start, monitor, and delete analysis runs
- **Results Viewing**: Display analysis results and charts
- **Public Sharing**: Generate public project URLs
- **Project Settings**: Update project details and permissions

### Real-time Updates

WebSocket integration provides real-time updates:

```typescript
// WebSocket context usage
const { subscribeToRun, unsubscribeFromRun } = useSocket()

useEffect(() => {
  const handleRunUpdate = (data: any) => {
    // Update UI based on run status
    queryClient.invalidateQueries(['runs'])
  }

  subscribeToRun(runId, handleRunUpdate)
  
  return () => unsubscribeFromRun(runId, handleRunUpdate)
}, [runId])
```

### Public Project Access

Public projects can be accessed without authentication:

- **Public URLs**: Shareable project links
- **Read-only Access**: View projects, runs, and results
- **Image Gallery**: Browse analysis results
- **No Authentication Required**: Direct access via URL

## Component Architecture

### Core Components

#### Authentication Components

```typescript
// AuthProvider - Authentication context
interface AuthContextType {
  user: User | null
  token: string | null
  login: (token: string, userId: string, isGuest: boolean) => void
  logout: () => void
  isAuthenticated: boolean
}

// LoginForm - User authentication
interface LoginFormProps {
  onSuccess: (data: LoginResponse) => void
  onError: (error: string) => void
}
```

#### Project Components

```typescript
// ProjectCard - Project display
interface ProjectCardProps {
  project: Project
  onDelete: (projectId: string) => void
  onView: (projectId: string) => void
}

// ProjectForm - Project creation/editing
interface ProjectFormProps {
  project?: Project
  onSubmit: (data: ProjectFormData) => void
  onCancel: () => void
}
```

#### Run Components

```typescript
// RunStatus - Run status display
interface RunStatusProps {
  status: RunStatus
  message?: string
  startedAt?: string
  finishedAt?: string
}

// FileUpload - File upload interface
interface FileUploadProps {
  onFilesSelected: (csv: File, jsl: File) => void
  onUpload: () => void
  isUploading: boolean
}
```

### UI Component Library

The application uses a custom UI component library built on top of Radix UI:

#### Available Components

- **Button**: Various button styles and sizes
- **Card**: Container components for content
- **Input**: Form input fields
- **Badge**: Status indicators
- **Dialog**: Modal dialogs
- **Alert**: Notification components
- **Loader**: Loading indicators

#### Usage Example

```typescript
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

function ProjectCard({ project }: { project: Project }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{project.name}</CardTitle>
        {project.is_public && <Badge>Public</Badge>}
      </CardHeader>
      <CardContent>
        <Button onClick={() => viewProject(project.id)}>
          View Project
        </Button>
      </CardContent>
    </Card>
  )
}
```

## State Management

### React Query

Server state management with React Query:

```typescript
// Query configuration
const { data: projects, isLoading, error } = useQuery({
  queryKey: ['projects'],
  queryFn: fetchProjects,
  refetchInterval: 5000, // Auto-refresh every 5 seconds
  refetchIntervalInBackground: true
})

// Mutation for data updates
const createProjectMutation = useMutation({
  mutationFn: createProject,
  onSuccess: () => {
    queryClient.invalidateQueries(['projects'])
    toast.success('Project created successfully')
  },
  onError: (error) => {
    toast.error(error.message)
  }
})
```

### Context Providers

#### Authentication Context

```typescript
// lib/auth.tsx
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)

  const login = (newToken: string, userId: string, isGuest: boolean) => {
    setToken(newToken)
    setUser({ id: userId, is_guest: isGuest, is_admin: false })
    localStorage.setItem('auth_token', newToken)
    localStorage.setItem('user_id', userId)
    localStorage.setItem('is_guest', isGuest.toString())
  }

  const logout = () => {
    setUser(null)
    setToken(null)
    localStorage.removeItem('auth_token')
    localStorage.removeItem('user_id')
    localStorage.removeItem('is_guest')
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
```

#### WebSocket Context

```typescript
// lib/socket.tsx
export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<WebSocket | null>(null)
  const updateCallbacks = useRef<Map<string, (data: any) => void>>(new Map())

  const subscribeToRun = (runId: string, callback: (data: any) => void) => {
    updateCallbacks.current.set(runId, callback)
    
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'subscribe', run_id: runId }))
    }
  }

  const unsubscribeFromRun = (runId: string) => {
    updateCallbacks.current.delete(runId)
    
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'unsubscribe', run_id: runId }))
    }
  }

  return (
    <SocketContext.Provider value={{ subscribeToRun, unsubscribeFromRun }}>
      {children}
    </SocketContext.Provider>
  )
}
```

## Styling

### Tailwind CSS

The application uses Tailwind CSS for styling:

#### Configuration

```typescript
// tailwind.config.ts
export default {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        // ... more colors
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
```

#### Design System

- **Color Scheme**: Consistent color palette with CSS variables
- **Typography**: Inter font family with consistent sizing
- **Spacing**: 4px base unit for consistent spacing
- **Components**: Reusable component patterns
- **Responsive**: Mobile-first responsive design

#### Usage Examples

```typescript
// Card component styling
<Card className="mb-6 p-4 border border-gray-200 rounded-lg shadow-sm">
  <CardHeader className="pb-3">
    <CardTitle className="text-lg font-semibold text-gray-900">
      Project Title
    </CardTitle>
  </CardHeader>
  <CardContent className="space-y-4">
    <p className="text-gray-600 text-sm">
      Project description
    </p>
    <div className="flex gap-2">
      <Button variant="primary" size="sm">
        View
      </Button>
      <Button variant="outline" size="sm">
        Edit
      </Button>
    </div>
  </CardContent>
</Card>
```

## API Integration

### API Client

```typescript
// API utility functions
const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL

export async function fetchProjects(token: string): Promise<Project[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/projects`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  })
  
  if (!response.ok) {
    throw new Error('Failed to fetch projects')
  }
  
  return response.json()
}

export async function createProject(
  projectData: ProjectCreate,
  token: string
): Promise<Project> {
  const response = await fetch(`${API_BASE_URL}/api/v1/projects`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(projectData),
  })
  
  if (!response.ok) {
    throw new Error('Failed to create project')
  }
  
  return response.json()
}
```

### Error Handling

```typescript
// Error handling utility
export function handleApiError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  
  if (typeof error === 'string') {
    return error
  }
  
  return 'An unexpected error occurred'
}

// Usage in components
const { mutate: createProject, error } = useMutation({
  mutationFn: createProject,
  onError: (error) => {
    const message = handleApiError(error)
    toast.error(message)
  }
})
```

## Development

### Adding New Pages

1. Create page file in `app/` directory
2. Add routing as needed
3. Update navigation components
4. Add TypeScript interfaces

#### Example: New Admin Page

```typescript
// app/admin/reports/page.tsx
'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function ReportsPage() {
  const [reports, setReports] = useState([])

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">Reports</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>System Reports</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Reports functionality coming soon...</p>
        </CardContent>
      </Card>
    </div>
  )
}
```

### Adding New Components

1. Create component file in `components/` directory
2. Define TypeScript interfaces
3. Add to component exports
4. Update documentation

#### Example: New Component

```typescript
// components/StatusIndicator.tsx
interface StatusIndicatorProps {
  status: 'success' | 'error' | 'warning' | 'info'
  message: string
}

export function StatusIndicator({ status, message }: StatusIndicatorProps) {
  const statusColors = {
    success: 'bg-green-100 text-green-800',
    error: 'bg-red-100 text-red-800',
    warning: 'bg-yellow-100 text-yellow-800',
    info: 'bg-blue-100 text-blue-800',
  }

  return (
    <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[status]}`}>
      {message}
    </div>
  )
}
```

### Testing

#### Unit Testing

```bash
# Install testing dependencies
npm install --save-dev @testing-library/react @testing-library/jest-dom jest

# Run tests
npm test

# Run tests with coverage
npm test -- --coverage
```

#### Example Test

```typescript
// __tests__/components/ProjectCard.test.tsx
import { render, screen } from '@testing-library/react'
import { ProjectCard } from '@/components/ProjectCard'

const mockProject = {
  id: '1',
  name: 'Test Project',
  description: 'Test Description',
  is_public: false,
  created_at: '2023-01-01T00:00:00Z',
  member_count: 1,
  run_count: 0
}

test('renders project card', () => {
  render(<ProjectCard project={mockProject} />)
  
  expect(screen.getByText('Test Project')).toBeInTheDocument()
  expect(screen.getByText('Test Description')).toBeInTheDocument()
})
```

## Deployment

### Production Build

```bash
# Build for production
npm run build

# Start production server
npm start
```

### Environment Variables

```env
# Production environment variables
NEXT_PUBLIC_BACKEND_URL=https://api.yourdomain.com
NEXT_PUBLIC_WS_URL=wss://api.yourdomain.com
```

### Docker Deployment

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build application
RUN npm run build

# Expose port
EXPOSE 4800

# Start application
CMD ["npm", "start"]
```

### Vercel Deployment

1. Connect repository to Vercel
2. Set environment variables
3. Deploy automatically on push

```json
// vercel.json
{
  "env": {
    "NEXT_PUBLIC_BACKEND_URL": "https://api.yourdomain.com",
    "NEXT_PUBLIC_WS_URL": "wss://api.yourdomain.com"
  }
}
```

## Troubleshooting

### Common Issues

1. **Build Errors**
   - Check TypeScript errors
   - Verify environment variables
   - Clear `.next` directory

2. **Runtime Errors**
   - Check browser console
   - Verify API connectivity
   - Check authentication state

3. **Performance Issues**
   - Optimize images
   - Use React.memo for components
   - Implement code splitting

### Debug Mode

```bash
# Enable debug logging
DEBUG=* npm run dev

# Or with specific namespace
DEBUG=frontend:* npm run dev
```

### Browser DevTools

- **React DevTools**: Component inspection
- **Redux DevTools**: State management debugging
- **Network Tab**: API request monitoring
- **Console**: Error logging and debugging

## Performance Optimization

### Code Splitting

```typescript
// Dynamic imports for code splitting
const AdminDashboard = dynamic(() => import('@/components/AdminDashboard'), {
  loading: () => <div>Loading...</div>,
  ssr: false
})
```

### Image Optimization

```typescript
// Next.js Image component for optimization
import Image from 'next/image'

<Image
  src="/image.jpg"
  alt="Description"
  width={500}
  height={300}
  priority={false}
  placeholder="blur"
  blurDataURL="data:image/jpeg;base64,..."
/>
```

### Caching

```typescript
// React Query caching configuration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
    },
  },
})
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

[Add your license information here]
