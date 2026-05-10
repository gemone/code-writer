const DEP_ALIASES: Record<string, string> = {
  // JavaScript/TypeScript
  'react-dom': 'react',
  'react-router-dom': 'react-router',
  '@react-router': 'react-router',
  'next': 'next.js',
  '@prisma/client': 'prisma',
  'prisma': 'prisma',
  '@tanstack/react-query': 'tanstack-query',
  '@tanstack/vue-query': 'tanstack-query',
  '@tanstack/svelte-query': 'tanstack-query',
  '@tanstack/react-table': 'tanstack-table',
  '@trpc/server': 'trpc',
  '@trpc/client': 'trpc',
  '@trpc/react-query': 'trpc',
  '@emotion/react': 'emotion',
  '@emotion/styled': 'emotion',
  '@mui/material': 'mui',
  '@mui/base': 'mui',
  '@mui/icons-material': 'mui',
  '@chakra-ui/react': 'chakra-ui',
  '@headlessui/react': 'headlessui',
  '@headlessui/vue': 'headlessui',
  '@radix-ui/react-dialog': 'radix-ui',
  '@radix-ui/themes': 'radix-ui',
  'zod': 'zod',
  'class-validator': 'class-validator',
  'typeorm': 'typeorm',
  '@nestjs/common': 'nestjs',
  '@nestjs/core': 'nestjs',
  'drizzle-orm': 'drizzle',
  'drizzle-kit': 'drizzle',
  'tailwindcss': 'tailwind',
  '@tailwindcss/vite': 'tailwind',

  // Python
  'Pillow': 'pillow',
  'pydantic': 'pydantic',
  'sqlalchemy': 'sqlalchemy',
  'django': 'django',
  'flask': 'flask',
  'fastapi': 'fastapi',
  'celery': 'celery',
  'pytest': 'pytest',
  'numpy': 'numpy',
  'pandas': 'pandas',
  'scikit-learn': 'scikit-learn',
  'sklearn': 'scikit-learn',
  'matplotlib': 'matplotlib',
  'requests': 'requests',
  'httpx': 'httpx',
  'aiohttp': 'aiohttp',
  'boto3': 'boto3',
  'langchain': 'langchain',
  'langchain-core': 'langchain',
  'langchain-community': 'langchain',
  'uvicorn': 'uvicorn',
  'gunicorn': 'gunicorn',
  'alembic': 'alembic',
  'pytest-asyncio': 'pytest',

  // Go
  'gin-gonic/gin': 'gin',
  'gorilla/mux': 'gorilla-mux',
  'labstack/echo': 'echo',
  'go-chi/chi': 'chi',
  'urfave/cli': 'cli',
  'spf13/cobra': 'cobra',
  'spf13/viper': 'viper',

  // Rust
  'serde_json': 'serde',
  'serde_derive': 'serde',
  'tokio-util': 'tokio',
  'actix-web-codegen': 'actix-web',
  'axum-extra': 'axum',
};

export function resolveDepAlias(name: string): string {
  return DEP_ALIASES[name] || name;
}

export function getDepAliases(): Record<string, string> {
  return { ...DEP_ALIASES };
}
