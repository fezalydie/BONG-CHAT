import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { config } from '../config.js';
import { asyncHandler, HttpError, ok } from '../utils/http.js';
import { requireAuth } from '../middleware/auth.js';

export const uploadsRouter = Router();

fs.mkdirSync(config.uploadDir, { recursive: true });

const ALLOWED: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const ALLOWED_VIDEO: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'video/ogg': '.ogv',
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadDir),
  filename: (_req, file, cb) => {
    const ext =
      ALLOWED[file.mimetype] ??
      ALLOWED_VIDEO[file.mimetype] ??
      path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadBytes },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED[file.mimetype]) {
      cb(new Error('Only JPEG, PNG, WebP and GIF images are allowed.'));
      return;
    }
    cb(null, true);
  },
});

const uploadVideo = multer({
  storage,
  limits: { fileSize: config.maxVideoBytes },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_VIDEO[file.mimetype]) {
      cb(new Error('Only MP4, WebM, MOV and Ogg videos are allowed.'));
      return;
    }
    cb(null, true);
  },
});

/**
 * Single image upload endpoint used for avatars, posts, stories and chat.
 * Files land in server/uploads and are served statically at /uploads/...
 */
uploadsRouter.post(
  '/',
  requireAuth,
  (req, res, next) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (err) {
        next(new HttpError(400, err instanceof Error ? err.message : 'Upload failed.'));
        return;
      }
      next();
    });
  },
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'Choose an image to upload.');
    ok(res, { url: `/uploads/${req.file.filename}`, kind: 'image' }, 201);
  }),
);

/**
 * Video upload endpoint for story videos. Videos are larger than images, so
 * this accepts a bigger payload (MAX_VIDEO_MB, default 50) and video types only.
 */
uploadsRouter.post(
  '/video',
  requireAuth,
  (req, res, next) => {
    uploadVideo.single('file')(req, res, (err: unknown) => {
      if (err) {
        next(new HttpError(400, err instanceof Error ? err.message : 'Upload failed.'));
        return;
      }
      next();
    });
  },
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'Choose a video to upload.');
    ok(res, { url: `/uploads/${req.file.filename}`, kind: 'video' }, 201);
  }),
);
