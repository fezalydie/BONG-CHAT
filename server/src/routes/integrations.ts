import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { asyncHandler, ok } from '../utils/http.js';

export const integrationsRouter = Router();

/**
 * Official entry points for the three external platforms.
 *  - `webUrl` always works (browser).
 *  - `deepLink` asks the device to open the installed app where supported,
 *    falling back to `webUrl` when the app is missing.
 * Only public links are used: BONG CHAT never asks for private platform data.
 */
const PLATFORMS = [
  {
    id: 'facebook',
    name: 'Facebook',
    description: 'News Feed, Groups and Marketplace',
    webUrl: 'https://www.facebook.com/',
    deepLinks: ['fb://', 'fb://facewebmodal/f?href=https://www.facebook.com/'],
    color: '#1877F2',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    description: 'Reels, Stories and DMs',
    webUrl: 'https://www.instagram.com/',
    deepLinks: ['instagram://app', 'instagram://user?username=instagram'],
    color: '#E1306C',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    description: 'Chats via WhatsApp Web or the app',
    webUrl: 'https://web.whatsapp.com/',
    deepLinks: ['whatsapp://send', 'whatsapp://chat'],
    color: '#25D366',
  },
];

integrationsRouter.get(
  '/',
  optionalAuth,
  asyncHandler(async (_req, res) => {
    ok(res, { platforms: PLATFORMS });
  }),
);
