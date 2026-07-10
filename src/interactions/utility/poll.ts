import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { db } from '../../database/db';

export const pollCommand = {
    data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Manage server polls')
        .addSubcommand(s => s.setName('create').setDescription('Create a new poll')
            .addStringOption(o => o.setName('question').setDescription('Poll question').setRequired(true)))
        .addSubcommand(s => s.setName('end').setDescription('Close an active poll')
            .addStringOption(o => o.setName('poll_id').setDescription('Poll ID').setRequired(true)))
        .addSubcommand(s => s.setName('results').setDescription('View poll results')
            .addStringOption(o => o.setName('poll_id').setDescription('Poll ID').setRequired(true))),

    async execute(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has('ManageMessages')) return interaction.reply({ content: '⛔ Unauthorized.', ephemeral: true });
        
        const sub = interaction.options.getSubcommand();

        if (sub === 'create') {
            const question = interaction.options.getString('question', true);
            const poll = await db.poll.create({ data: { question, creatorId: interaction.user.id } });

            const embed = new EmbedBuilder()
                .setTitle('📊 Community Poll')
                .setDescription(`**${question}**\n\nClick below to cast your vote!`)
                .setColor('#3498db')
                .setFooter({ text: `Poll ID: ${poll.id}` });

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId(`poll_vote_Yes_${poll.id}`).setLabel('Yes').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`poll_vote_No_${poll.id}`).setLabel('No').setStyle(ButtonStyle.Danger)
            );

            await interaction.reply({ embeds: [embed], components: [row] });
        }

        if (sub === 'results' || sub === 'end') {
            const pollId = interaction.options.getString('poll_id', true);
            const poll = await db.poll.findUnique({ where: { id: pollId }, include: { votes: true } });
            
            if (!poll) return interaction.reply({ content: '❌ Poll not found.', ephemeral: true });

            if (sub === 'end') {
                await db.poll.update({ where: { id: pollId }, data: { active: false } });
            }

            const yesVotes = poll.votes.filter(v => v.choice === 'Yes').length;
            const noVotes = poll.votes.filter(v => v.choice === 'No').length;

            const embed = new EmbedBuilder()
                .setTitle(`📊 Poll Results: ${sub === 'end' ? '(CLOSED)' : ''}`)
                .setDescription(`**Question:** ${poll.question}\n\n🟩 **Yes:** ${yesVotes}\n🟥 **No:** ${noVotes}`)
                .setColor(sub === 'end' ? '#95a5a6' : '#f1c40f');

            await interaction.reply({ embeds: [embed] });
        }
    }
};
