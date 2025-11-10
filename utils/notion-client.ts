import { Client } from '@notionhq/client'

export function getNotionClient(token: string) {
  return new Client({ auth: token })
}
