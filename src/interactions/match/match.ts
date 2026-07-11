import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, GuildMember } from 'discord.js';
import { db } from '../../database/db';

export const matchCommand = {
    data: new SlashCommandBuilder()
        .setName('match')
        .setDescription('Advanced Matchmaking & Reporting Engine')
        .addSubcommand(s => s.setName('host').setDescription('Deploy a new match queue')
            .addStringOption(o => o.setName('gametype').setDescription('Type of match').setRequired(true).addChoices({name: 'Ranked', value: 'Ranked'}, {name: 'League', value: 'League'}, {name: 'Scrim', value: 'Scrim'}, {name: 'Casual', value: 'Casual'}))
            .addStringOption(o => o.setName('matchtype').setDescription('Format').setRequired(true).addChoices({name: '1v1', value: '1v1'}, {name: '2v2', value: '2v2'}, {name: '3v3', value: '3v3'}, {name: '4v4', value: '4v4'}, {name: '5v5', value: '5v5'}))
            .addStringOption(o => o.setName('region').setDescription('Server Region').setRequired(true).addChoices({name: 'NA East', value: 'NA East'}, {name: 'NA West', value: 'NA West'}, {name: 'Europe', value: 'Europe'}, {name: 'OCE (Australia)', value: 'OCE'}, {name: 'Asia', value: 'Asia'}))
            .addStringOption(o => o.setName('vipserver').setDescription('Private Server Link (Hidden from public)').setRequired(false)))
        .addSubcommand(s => s.setName('teams').setDescription('Generate balanced teams & lock queue'))
        .addSubcommand(s => s.setName('report').setDescription('Declare winner and distribute Points/Elo')
            .addStringOption(o => o.setName('winner').setDescription('Winning Team').setRequired(true).addChoices({name: 'Team A', value: 'A'}, {name: 'Team B', value: 'B'})))
        .addSubcommandGroup(g => g.setName('manage').setDescription('Staff queue overrides')
            .addSubcommand(s => s.setName('sub').setDescription('Swap a crashed/AFK player').addUserOption(o => o.setName('out').setDescription('Player leaving').setRequired(true)).addUserOption(o => o.setName('in').setDescription('Player joining').setRequired(true)))
            .addSubcommand(s => s.setName('cancel').setDescription('Forcibly destroy a queue without points'))
            .addSubcommand(s => s.setName('forcejoin').setDescription('Admin: Bypass verification to insert player').addUserOption(o => o.setName('user').setDescription('Player to insert').setRequired(true)))
            .addSubcommand(s => s.setName('forceleave').setDescription('Admin: Forcibly remove player from queue').addUserOption(o => o.setName('user').setDescription('Player to remove').setRequired(true)))),

    async execute(interaction: ChatInputCommandInteraction) {
        const settings = await db.settings.findUnique({ where: { id: 'global' } });
        const member = interaction.member as GuildMember;
        const isHoster = member.permissions.has('Administrator') || (settings?.matchHosterRoleId && member.roles.cache.has(settings.matchHosterRoleId));
        
        if (!isHoster) return interaction.reply({ content: '⛔ You lack the Match Hoster role.', ephemeral: true });

        const sub = interaction.options.getSubcommand();

        if (sub === 'host') {
            const gameType = interaction.options.getString('gametype', true);
            const matchType = interaction.options.getString('matchtype', true);
            const region = interaction.options.getString('region', true);
            const vipServer = interaction.options.getString('vipserver');

            const existing = await db.league.findFirst({ where: { hostId: interaction.user.id, status: 'PENDING' } });
            if (existing) return interaction.reply({ content: '❌ You are already hosting a pending match.', ephemeral: true });

            // Calculate capacity (e.g. 5v5 -> 10)
            const teamSize = parseInt(matchType.split('v')[0]);
            const capacity = teamSize * 2;

            const league = await db.league.create({ data: { hostId: interaction.user.id, channelId: interaction.channelId, gameType, matchType, region, vipServer, capacity } });
            
            await interaction.reply({ content: '✅ Queue deployed.', ephemeral: true });

            const embed = new EmbedBuilder()
                .setTitle(`🏆 OCL ${gameType} Queue [${matchType}]`)
                .setDescription(`**Host:** <@${interaction.user.id}>\n**Region:** ${region}\n\n**Players Joined: 0/${capacity}**\n*Click Join Match to verify and receive the VIP server link.*`)
                .setColor('#337def')
                .setImage('https://i.imgur.com/KvxOH6m.png')
                .setFooter({ text: `Match ID: ${league.id}` });

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId(`join_match_${league.id}`).setLabel('Join Match').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`leave_match_${league.id}`).setLabel('Leave').setStyle(ButtonStyle.Danger)
            );
            await interaction.channel?.send({ embeds: [embed], components: [row] });
        }

        if (sub === 'teams') {
            const league = await db.league.findFirst({ where: { hostId: interaction.user.id, status: 'PENDING' } });
            if (!league) return interaction.reply({ content: '❌ No pending match found.', ephemeral: true });

            const players = await db.user.findMany({ where: { activeLeague: league.id } });
            if (players.length < league.capacity && !member.permissions.has('Administrator')) {
                return interaction.reply({ content: `❌ Match is not full (${players.length}/${league.capacity}).`, ephemeral: true });
            }

            const shuffled = players.sort(() => 0.5 - Math.random());
            const mid = Math.ceil(shuffled.length / 2);
            const teamA = shuffled.slice(0, mid);
            const teamB = shuffled.slice(mid);
            
            // Assign active teams in DB for the report system
            for (const p of teamA) await db.user.update({ where: { id: p.id }, data: { activeTeam: 'A' } });
            for (const p of teamB) await db.user.update({ where: { id: p.id }, data: { activeTeam: 'B' } });
            
            await db.league.update({ where: { id: league.id }, data: { status: 'ACTIVE' } });
            await interaction.reply({ content: '✅ Teams generated and locked.', ephemeral: true });

            const embed = new EmbedBuilder()
                .setTitle('🎲 Match Teams Locked')
                .addFields(
                    { name: '🔵 Team A', value: teamA.map(p => `<@${p.id}>`).join('\n') || 'Empty', inline: true },
                    { name: '🔴 Team B', value: teamB.map(p => `<@${p.id}>`).join('\n') || 'Empty', inline: true }
                )
                .setColor('#337def')
                .setThumbnail('https://i.imgur.com/f5LGesj.png');
            await interaction.channel?.send({ content: `🚨 <@${league.hostId}>, the match has begun! Use \`/match report\` when finished.`, embeds: [embed] });
        }

        if (sub === 'report') {
            const league = await db.league.findFirst({ where: { hostId: interaction.user.id, status: 'ACTIVE' } });
            if (!league) return interaction.reply({ content: '❌ You do not have an ACTIVE match to report.', ephemeral: true });

            const winner = interaction.options.getString('winner', true);
            const players = await db.user.findMany({ where: { activeLeague: league.id } });
            
            const winPts = settings?.winPoints ?? 25;
            const losePts = settings?.losePoints ?? 0;

            const matchRecord = await db.match.create({ data: { leagueId: league.id, winningTeam: winner } });

            for (const p of players) {
                const isWinner = p.activeTeam === winner;
                const ptsToAdd = isWinner ? winPts : losePts;
                
                await db.user.update({
                    where: { id: p.id },
                    data: {
                        points: { increment: ptsToAdd },
                        elo: { increment: isWinner ? 15 : -10 }, // Basic Elo scaling
                        activeLeague: null,
                        activeTeam: null
                    }
                });

                await db.matchPlayer.create({ data: { matchId: matchRecord.id, userId: p.id, win: isWinner } });
            }

            await db.league.update({ where: { id: league.id }, data: { status: 'CLOSED' } });
            await interaction.reply({ content: `✅ Match reported. Team ${winner} won. Points and Elo distributed safely.`, ephemeral: true });
        }

        if (sub === 'cancel') {
            const league = await db.league.findFirst({ where: { hostId: interaction.user.id, status: { in: ['PENDING', 'ACTIVE'] } } });
            if (!league) return interaction.reply({ content: '❌ No active match found.', ephemeral: true });
            await db.user.updateMany({ where: { activeLeague: league.id }, data: { activeLeague: null, activeTeam: null } });
            await db.league.delete({ where: { id: league.id } });
            await interaction.reply({ content: '✅ Match destroyed without point distribution.', ephemeral: true });
        }

        if (sub === 'sub') {
            const playerOut = interaction.options.getUser('out', true);
            const playerIn = interaction.options.getUser('in', true);
            
            const dbOut = await db.user.findUnique({ where: { id: playerOut.id } });
            if (!dbOut?.activeLeague) return interaction.reply({ content: '❌ The outgoing player is not in an active match.', ephemeral: true });

            await db.user.update({ where: { id: playerOut.id }, data: { activeLeague: null, activeTeam: null } });
            await db.user.upsert({ where: { id: playerIn.id }, update: { activeLeague: dbOut.activeLeague, activeTeam: dbOut.activeTeam }, create: { id: playerIn.id, activeLeague: dbOut.activeLeague, activeTeam: dbOut.activeTeam } });
            
            await interaction.reply({ content: `🔁 Substituted <@${playerOut.id}> out for <@${playerIn.id}>. The new player inherited their team slot.`, ephemeral: true });
        }
        
        if (sub === 'forcejoin') {
            const target = interaction.options.getUser('user', true);
            const league = await db.league.findFirst({ where: { hostId: interaction.user.id, status: 'PENDING' } });
            if (!league) return interaction.reply({ content: '❌ You must be hosting a pending queue.', ephemeral: true });
            await db.user.upsert({ where: { id: target.id }, update: { activeLeague: league.id }, create: { id: target.id, activeLeague: league.id }});
            return interaction.reply({ content: `✅ Forced <@${target.id}> into queue.`, ephemeral: true });
        }
        if (sub === 'forceleave') {
            const target = interaction.options.getUser('user', true);
            await db.user.updateMany({ where: { id: target.id }, data: { activeLeague: null, activeTeam: null } });
            return interaction.reply({ content: `👢 Kicked <@${target.id}> from queues.`, ephemeral: true });
        }
    }
};
