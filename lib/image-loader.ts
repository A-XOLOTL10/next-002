import type { ImageLoaderProps } from "next/image"

// Event images live on Cloudinary, which can resize and compress on its own CDN. Asking it
// directly ("f_auto,q_auto,w_<width>") means:
//   - each screen downloads an image no wider than it needs (next/image picks the width),
//   - modern formats (AVIF/WebP) are served to browsers that support them,
//   - no second hop through Vercel's image optimizer (faster, and no optimizer quota used).
// Other images (local /images, Unsplash) keep the default next/image loader.

const CLOUDINARY_UPLOAD = /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//

export const isCloudinaryUrl = (src: string): boolean => CLOUDINARY_UPLOAD.test(src)

export function cloudinaryLoader({ src, width, quality }: ImageLoaderProps): string {
  const transforms = ["f_auto", `q_${quality ? Math.min(Math.max(quality, 30), 100) : "auto"}`, "c_limit", `w_${width}`].join(",")
  // Insert the transformations right after "/upload/", before the version or file name.
  return src.replace(/(\/image\/upload\/)/, `$1${transforms}/`)
}
