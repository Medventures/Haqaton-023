import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { checkSigned } from './token';

export async function requireDoctorPage() {
  const c = (await cookies()).get('doc')?.value;
  if (!checkSigned(c, 'doctor')) redirect('/doctor/login');
}
