import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'
import { storiesLoader } from './loaders/stories'
import { storySchema } from './data/stories.schema'

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

// Stories come from the app's public API at build time, not from files in
// this repo. See src/loaders/stories.ts for the failure policy and the
// fixture escape hatch.
const stories = defineCollection({
  loader: storiesLoader(),
  schema: storySchema,
})

export const collections = { blog, stories }
