const { Client } = require('@notionhq/client');

/**
 * Notion Integration for Vtalk
 * Requirements: 
 * - NOTION_API_KEY in .env
 * - NOTION_PARENT_PAGE_ID in .env
 */

let notion = null;
if (process.env.NOTION_API_KEY) {
    notion = new Client({ auth: process.env.NOTION_API_KEY });
}

async function createNotionDoc(title, content, tasks = []) {
    if (!notion || !process.env.NOTION_PARENT_PAGE_ID) {
        throw new Error('Notion API not configured. Please add NOTION_API_KEY and NOTION_PARENT_PAGE_ID to your .env file.');
    }

    try {
        const response = await notion.pages.create({
            parent: { page_id: process.env.NOTION_PARENT_PAGE_ID },
            properties: {
                title: [
                    {
                        text: {
                            content: `Vtalk Meeting: ${title}`
                        }
                    }
                ]
            },
            children: [
                {
                    object: 'block',
                    type: 'heading_2',
                    heading_2: {
                        rich_text: [{ text: { content: 'Summary' } }]
                    }
                },
                {
                    object: 'block',
                    type: 'paragraph',
                    paragraph: {
                        rich_text: [{ text: { content: content || 'No summary available.' } }]
                    }
                },
                {
                    object: 'block',
                    type: 'heading_2',
                    heading_2: {
                        rich_text: [{ text: { content: 'Action Items' } }]
                    }
                },
                ...tasks.map(task => ({
                    object: 'block',
                    type: 'to_do',
                    to_do: {
                        rich_text: [{ text: { content: task.text || task } }],
                        checked: false
                    }
                })).slice(0, 90), // Notion limit is 100 blocks
                {
                    object: 'block',
                    type: 'heading_2',
                    heading_2: {
                        rich_text: [{ text: { content: 'Transcript' } }]
                    }
                },
                {
                    object: 'block',
                    type: 'callout',
                    callout: {
                        rich_text: [{ text: { content: 'See Vtalk app for full rich transcript history.' } }],
                        icon: { emoji: '🎙️' }
                    }
                }
            ]
        });

        return response.url;
    } catch (error) {
        console.error('[Notion] Error creating page:', error);
        throw error;
    }
}

module.exports = { createNotionDoc };
