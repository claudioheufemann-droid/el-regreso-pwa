import NextAuth, { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Correo', type: 'text' },
        password: { label: 'Contraseña', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Credenciales faltantes');
        }

        if (!credentials.email.endsWith('@elregresobeer.com')) {
          throw new Error('Correo no autorizado');
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user) {
          throw new Error('Usuario no encontrado');
        }

        const isPasswordValid = await bcrypt.compare(credentials.password, user.password);

        if (!isPasswordValid) {
          throw new Error('Contraseña incorrecta');
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role, // Custom field we can expose
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // @ts-ignore
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        // @ts-ignore
        session.user.role = token.role;
        // @ts-ignore
        session.user.id = token.sub;
      }
      return session;
    },
  },
  pages: {
    signIn: '/', // La página de inicio es nuestra pantalla de login
  },
  secret: process.env.NEXTAUTH_SECRET || 'secret-key-for-development-only',
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
