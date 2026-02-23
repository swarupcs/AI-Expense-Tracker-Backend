import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env';

const oauth2Client = new OAuth2Client(
  env.GOOGLE_CLIENT_ID,
  env.GOOGLE_CLIENT_SECRET,
  env.GOOGLE_REDIRECT_URI,
);

export interface GoogleUserInfo {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
  locale: string;
}

/**
 * Generate Google OAuth authorization URL
 */
export function getGoogleAuthUrl(): string {
  const scopes = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ];

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
  });
}

/**
 * Exchange authorization code for tokens and get user info
 */
export async function getGoogleUserInfo(code: string): Promise<GoogleUserInfo> {
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  const response = await fetch(
    'https://www.googleapis.com/oauth2/v2/userinfo',
    {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error('Failed to fetch Google user info');
  }

  const data = (await response.json()) as GoogleUserInfo;
  return data;
}

/**
 * Verify Google ID token (for direct Google Sign-In)
 */
export async function verifyGoogleToken(
  idToken: string,
): Promise<GoogleUserInfo> {
  const ticket = await oauth2Client.verifyIdToken({
    idToken,
    audience: env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  if (!payload) {
    throw new Error('Invalid Google token payload');
  }

  return {
    id: payload.sub,
    email: payload.email || '',
    verified_email: payload.email_verified ?? false,
    name: payload.name || '',
    given_name: payload.given_name || '',
    family_name: payload.family_name || '',
    picture: payload.picture || '',
    locale: payload.locale || 'en',
  };
}
