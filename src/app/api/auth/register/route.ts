import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export async function POST(req: Request) {
  try {
    const { name, email, password } = await req.json();

    // Validations
    if (!name || !email || !password) {
      return NextResponse.json({ message: 'Todos los campos son requeridos' }, { status: 400 });
    }

    if (!email.endsWith('@elregresobeer.com')) {
      return NextResponse.json({ message: 'Solo se permiten correos @elregresobeer.com' }, { status: 403 });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json({ message: 'El correo ya está registrado' }, { status: 409 });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
      },
    });

    // Don't send password back
    const { password: _, ...userWithoutPassword } = newUser;

    return NextResponse.json(
      { message: 'Usuario creado exitosamente', user: userWithoutPassword },
      { status: 201 }
    );
  } catch (error) {
    console.error('Registration Error:', error);
    return NextResponse.json({ message: 'Error interno del servidor' }, { status: 500 });
  }
}
