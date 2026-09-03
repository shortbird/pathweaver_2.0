import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    author: z.string().default('Dr. Tanner Bowman'),
    authorTitle: z.string().default('Founder and Head of School, Optio Academy'),
    ogImage: z.string().optional(),
    draft: z.boolean().default(false),
  }),
})

export const collections = { blog }
