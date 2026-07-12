import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, GuildMember } from 'discord.js';
import { db } from '../../database/db';
import { verifyPlayer } from '../../services/verification';

export const matchCommand = {
    data: new SlashCommandBuilder()
        .setName('match')
        .setDescription('Advanced Matchmaking & Reporting Engine')
        .addSubcommand(s => s.setName('host').setDescription('Deploy a new match queue')
            .addStringOption(o => o.setName('matchtype').setDescription('Format').setRequired(true).addChoices({name: '1v1', value: '1v1'}, {name: '2v2', value: '2v2'}, {name: '3v3', value: '3v3'}, {name: '4v4', value: '4v4'}, {name: '5v5', value: '5v5'}))
            .addStringOption(o => o.setName('region').setDescription('Server Region').setRequired(true).addChoices({name: 'NA East', value: 'NA East'}, {name: 'NA West', value: 'NA West'}, {name: 'Europe', value: 'Europe'}, {name: 'OCE (Australia)', value: 'OCE'}, {name: 'Asia', value: 'Asia'}))
            .addStringOption(o => o.setName('vipserver').setDescription('Private Server Link (Hidden from public)').setRequired(false)))
        .addSubcommand(s => s.setName('teams').setDescription('Generate balanced teams & lock queue'))
        .addSubcommand(s => s.setName('report').setDescription('Declare winner and distribute Points/Elo')
            .addStringOption(o => o.setName('winner').setDescription('Winning Team').setRequired(true).addChoices({name: 'Team A', value: 'A'}, {name: 'Team B', value: 'B'})))
        .addSubcommand(s => s.setName('requestsub').setDescription('Broadcast an interactive sub request')
            .addUserOption(o => o.setName('out').setDescription('The player who needs to be replaced').setRequired(true))
            .addUserOption(o => o.setName('target').setDescription('Specific user to request (leave blank for open sub)').setRequired(false)))
        .addSubcommandGroup(g => g.setName('manage').setDescription('Staff queue overrides')
            .addSubcommand(s => s.setName('sub').setDescription('Force swap a crashed/AFK player').addUserOption(o => o.setName('out').setDescription('Player leaving').setRequired(true)).addUserOption(o => o.setName('in').setDescription('Player joining').setRequired(true)))
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
            let gameType = null;
            if (interaction.channelId === settings?.rankedChannelId) gameType = 'Ranked';
            else if (interaction.channelId === settings?.leagueChannelId) gameType = 'League';
            else if (interaction.channelId === settings?.scrimChannelId) gameType = 'Scrim';
            else if (interaction.channelId === settings?.casualChannelId) gameType = 'Casual';

            if (!gameType) return interaction.reply({ content: '❌ This channel is not configured for matches. Please run this in a designated Match Deployment channel.', ephemeral: true });

            const existingQueue = await db.league.findFirst({ where: { channelId: interaction.channelId, status: { in: ['PENDING', 'ACTIVE'] } } });
            if (existingQueue) return interaction.reply({ content: '❌ There is already an ongoing match in this channel. Finish or cancel it first.', ephemeral: true });

            const matchType = interaction.options.getString('matchtype', true);
            const region = interaction.options.getString('region', true);
            const vipServer = interaction.options.getString('vipserver');
            const teamSize = parseInt(matchType.split('v')[0]);
            const capacity = teamSize * 2;

            const memberRoles = (interaction.member as GuildMember).roles.cache.map(r => r.id);
            const authCheck = await verifyPlayer(interaction.user.id, interaction.guildId!, memberRoles);
            if (!authCheck.verified) return interaction.reply({ content: `❌ Host Verification Failed: ${authCheck.message}`, ephemeral: true });

            const league = await db.league.create({ data: { hostId: interaction.user.id, channelId: interaction.channelId, gameType, matchType, region, vipServer, capacity } });
            await db.user.upsert({ where: { id: interaction.user.id }, update: { activeLeague: league.id }, create: { id: interaction.user.id, activeLeague: league.id } });

            await interaction.reply({ content: '✅ Queue deployed. You have been automatically joined as the Host.', ephemeral: true });

            const embed = new EmbedBuilder()
                .setTitle(`🏆 OCL ${gameType} Queue [${matchType}]`)
                .setDescription(`**Host:** <@${interaction.user.id}>\n**Region:** ${region}\n\n**Players Joined: 1/${capacity}**\n*Click Join Match to verify and receive the VIP server link.*`)
                .setColor('#337def')
                .setImage('https://i.imgur.com/KvxOH6m.png')
                .setFooter({ text: `Match ID: ${league.id}` });

            // ADDED CANCEL BUTTON DIRECTLY TO THE EMBED
            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId(`join_match_${league.id}`).setLabel('Join Match').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`leave_match_${league.id}`).setLabel('Leave').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`cancel_match_${league.id}`).setLabel('Cancel Queue').setStyle(ButtonStyle.Secondary)
            );
            await interaction.channel?.send({ embeds: [embed], components: [row] });
        }

        if (sub === 'requestsub') {
            const league = await db.league.findFirst({ where: { channelId: interaction.channelId, status: { in: ['PENDING', 'ACTIVE'] } } });
            if (!league) return interaction.reply({ content: '❌ No active match in this channel.', ephemeral: true });
            
            const playerOut = interaction.options.getUser('out', true);
            const target = interaction.options.getUser('target');

            const dbOut = await db.user.findUnique({ where: { id: playerOut.id } });
            if (dbOut?.activeLeague !== league.id) return interaction.reply({ content: `❌ <@${playerOut.id}> is not currently in this match.`, ephemeral: true });

            const targetId = target ? target.id : 'any';
            
            const embed = new EmbedBuilder()
                .setTitle('🔄 Substitute Requested')
                .setDescription(`**Host:** <@${league.hostId}>\n**Player Out:** <@${playerOut.id}>\n**Requested Sub:** ${target ? `<@${target.id}>` : 'Anyone'}\n\n*Click the button below to claim this slot!*`)
                .setColor('#f39c12');

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId(`sub_accept_${league.id}_${playerOut.id}_${targetId}`).setLabel('Claim Sub Spot').setStyle(ButtonStyle.Primary)
            );

            await interaction.reply({ content: target ? `🚨 <@${target.id}>, you have been requested to sub!` : '🚨 A substitute is needed!', embeds: [embed], components: [row] });
        }

        if (sub === 'teams') {
            const league = await db.league.findFirst({ where: { channelId: interaction.channelId, status: 'PENDING' } });
            if (!league) return interaction.reply({ content: '❌ No pending match found in this channel.', ephemeral: true });

            const players = await db.user.findMany({ where: { activeLeague: league.id } });
            if (players.length < league.capacity && !member.permissions.has('Administrator')) {
                return interaction.reply({ content: `❌ Match is not full (${players.length}/${league.capacity}).`, ephemeral: true });
            }

            const shuffled = players.sort(() => 0.5 - Math.random());
            const mid = Math.ceil(shuffled.length / 2);
            const teamA = shuffled.slice(0, mid);
            const teamB = shuffled.slice(mid);
            
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
            const league = await db.league.findFirst({ where: { channelId: interaction.channelId, status: 'ACTIVE' } });
            if (!league) return interaction.reply({ content: '❌ No ACTIVE match in this channel to report.', ephemeral: true });

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
                    data: { points: { increment: ptsToAdd }, elo: { increment: isWinner ? 15 : -10 }, activeLeague: null, activeTeam: null }
                });
                await db.matchPlayer.create({ data: { matchId: matchRecord.id, userId: p.id, win: isWinner } });
            }

            await db.league.update({ where: { id: league.id }, data: { status: 'CLOSED' } });
            await interaction.reply({ content: `✅ Match reported. Team ${winner} won. Points and Elo distributed safely.`, ephemeral: true });
        }

        if (sub === 'cancel') {
            const league = await db.league.findFirst({ where: { channelId: interaction.channelId, status: { in: ['PENDING', 'ACTIVE'] } } });
            if (!league) return interaction.reply({ content: '❌ No active match in this channel to cancel.', ephemeral: true });
            await db.user.updateMany({ where: { activeLeague: league.id }, data: { activeLeague: null, activeTeam: null } });
            await db.league.delete({ where: { id: league.id } });
            await interaction.reply({ content: '✅ Match completely scrubbed and destroyed.', ephemeral: true });
        }

        if (sub === 'sub') {
            const playerOut = interaction.options.getUser('out', true);
            const playerIn = interaction.options.getUser('in', true);
            
            if (playerIn.bot || playerOut.bot) return interaction.reply({ content: '❌ Bots cannot participate in matchmaking.', ephemeral: true });

            const dbOut = await db.user.findUnique({ where: { id: playerOut.id } });
            if (!dbOut?.activeLeague) return interaction.reply({ content: '❌ The outgoing player is not currently in an active match.', ephemeral: true });

            await db.user.update({ where: { id: playerOut.id }, data: { activeLeague: null, activeTeam: null } });
            await db.user.upsert({ where: { id: playerIn.id }, update: { activeLeague: dbOut.activeLeague, activeTeam: dbOut.activeTeam }, create: { id: playerIn.id, activeLeague: dbOut.activeLeague, activeTeam: dbOut.activeTeam } });
            
            await interaction.reply({ content: `🔁 Substituted <@${playerOut.id}> out for <@${playerIn.id}>. They inherited the slot.`, ephemeral: true });
        }
        
        if (sub === 'forcejoin') {
            const target = interaction.options.getUser('user', true);
            if (target.bot) return interaction.reply({ content: '❌ Bots cannot participate in matchmaking.', ephemeral: true });

            const league = await db.league.findFirst({ where: { channelId: interaction.channelId, status: 'PENDING' } });
            if (!league) return interaction.reply({ content: '❌ No pending queue in this channel to insert into.', ephemeral: true });
            await db.user.upsert({ where: { id: target.id }, update: { activeLeague: league.id }, create: { id: target.id, activeLeague: league.id }});
            return interaction.reply({ content: `✅ Forced <@${target.id}> into queue.`, ephemeral: true });
        }
        
        if (sub === 'forceleave') {
            const target = interaction.options.getUser('user', true);
            await db.user.updateMany({ where: { id: target.id }, data: { activeLeague: null, activeTeam: null } });
            return interaction.reply({ content: `👢 Kicked <@${target.id}> from all queues.`, ephemeral: true });
        }
    }
};
