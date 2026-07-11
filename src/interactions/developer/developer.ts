import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';

// CONSTANT: Replace this with your exact personal Discord User ID
const AUTHORIZED_DEVELOPER_ID = '1197110500333469720'; 

export const developerCommand = {
    data: new SlashCommandBuilder()
        .setName('dev')
        .setDescription('Developer core execution utilities')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // Hides from regular users in UI
        .addSubcommand(s => s
            .setName('ai')
            .setDescription('Exclusive developer AI utility agent')
            .addStringOption(o => o.setName('prompt').setDescription('Instructions or queries for the bot agent').setRequired(true))
            .addStringOption(o => o.setName('link').setDescription('Optional Discord message link to provide context').setRequired(false))),

    async execute(interaction: ChatInputCommandInteraction) {
        // STRICT SECURITY GATEKEEPER: Absolute denial for anyone except you
        if (interaction.user.id !== AUTHORIZED_DEVELOPER_ID) {
            return interaction.reply({ content: '❌ Unknown command or insufficient permissions.', ephemeral: true });
        }

        const sub = interaction.options.getSubcommand();

        if (sub === 'ai') {
            await interaction.deferReply({ ephemeral: true });
            
            const prompt = interaction.options.getString('prompt', true);
            const contextLink = interaction.options.getString('link');
            const apiKey = process.env.GEMINI_API_KEY;

            if (!apiKey) {
                return interaction.editReply('❌ System configuration error: `GEMINI_API_KEY` is missing from the environment variables.');
            }

            let groundedContext = '';

            // Message Link Context Parser
            if (contextLink) {
                const messageUrlRegex = /discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/;
                const match = contextLink.match(messageUrlRegex);

                if (match) {
                    const [, , channelId, messageId] = match;
                    try {
                        const channel = await interaction.guild?.channels.fetch(channelId);
                        if (channel && 'messages' in channel) {
                            const targetMessage = await channel.messages.fetch(messageId);
                            groundedContext = `[Context Message from @${targetMessage.author.username} in #${channel.name}]:\n"${targetMessage.content}"\n\n`;
                        }
                    } catch (fetchError) {
                        return interaction.editReply('⚠️ Unable to retrieve context message. Ensure the link is valid and the bot has access to that channel.');
                    }
                } else {
                    return interaction.editReply('❌ Invalid Discord message link format provided.');
                }
            }

            // Construct System Directives & Contextual Payload
            const systemInstruction = "You are a specialized developer assistant built directly inside a Discord management bot. You analyze system issues, inspect message contexts, and provide strategic instructions on how to maintain, patch, or configure the application.";
            
            const fullPromptPayload = `${systemInstruction}\n\n${groundedContext}Developer Request: ${prompt}`;

            try {
                // Native Fetch request to the Gemini API endpoint
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{ text: fullPromptPayload }]
                        }]
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    return interaction.editReply(`❌ Gemini API connection failure: Status ${response.status} - ${errorData?.error?.message || 'Unknown error'}`);
                }

                const data = await response.json();
                const aiOutput = data?.candidates?.[0]?.content?.parts?.[0]?.text;

                if (!aiOutput) {
                    return interaction.editReply('❌ Received an empty response signature from the AI cluster.');
                }

                // Split long responses safely to remain within Discord text limitations
                if (aiOutput.length > 2000) {
                    const chunks = aiOutput.match(/[\s\S]{1,1900}/g) || [];
                    await interaction.editReply(chunks[0]);
                    for (let i = 1; i < chunks.length; i++) {
                        await interaction.followUp({ content: chunks[i], ephemeral: true });
                    }
                } else {
                    await interaction.editReply(aiOutput);
                }

            } catch (apiError) {
                await interaction.editReply('❌ A critical network exception occurred while routing data to the AI runtime engine.');
            }
        }
    }
};
