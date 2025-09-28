const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const cron = require('node-cron');
const fs = require('fs').promises; 
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

let config = {
    autoChannelId: null,
    nsfwChannelId: null,
    useNekos: true,
    probAnime: 0.5,
    probCute: 0.2,
    probFurry: 0.2,
    probNSFW: 0.1,
    useTrap: false
};
const CONFIG_FILE = 'config.json';
const HISTORY_FILE = 'history.json';
const MAX_HISTORY = 5000;

const TOKEN = 'none';

async function loadConfig() {
    try {
        const data = await fs.readFile(CONFIG_FILE, 'utf8');
        config = { ...config, ...JSON.parse(data) };
    } catch (error) {
        await saveConfig();
    }
}

async function saveConfig() {
    try {
        await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
    } catch (error) {
        console.error('Lỗi khi lưu config:', error);
    }
}

async function loadHistory() {
    try {
        const data = await fs.readFile(HISTORY_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
}

async function saveHistory(history) {
    try {
        if (history.length > MAX_HISTORY) {
            history = history.slice(-MAX_HISTORY);
        }
        await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2));
    } catch (error) {
        console.error('Lỗi khi lưu lịch sử:', error);
    }
}

client.once('ready', async () => {
    console.log(`Bot ${client.user.tag} đã online!`);
    await loadConfig();
    if (config.autoChannelId) {
        cron.schedule('0 */30 * * * *', async () => {
            const channel = client.channels.cache.get(config.autoChannelId);
            if (channel) {
                await sendRandomAnime(channel);
            }
        }, {
            timezone: 'Asia/Ho_Chi_Minh'
        });
    }
    if (config.nsfwChannelId) {
        cron.schedule('0 */30 * * * *', async () => {
            const channel = client.channels.cache.get(config.nsfwChannelId);
            if (channel) {
                await sendNSFWAnime(channel);
            }
        }, {
            timezone: 'Asia/Ho_Chi_Minh'
        });
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith('!')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'setup') {
        if (!message.member.permissions.has('Administrator')) {
            return message.reply('Bạn cần quyền Admin để dùng lệnh này!');
        }

        if (args[0] === 'nsfw') {
            if (!message.channel.nsfw) {
                return message.reply('Kênh này phải được đánh dấu là NSFW để thiết lập gửi nội dung NSFW!');
            }
            config.nsfwChannelId = message.channel.id;
            await saveConfig();
            message.reply('✅ Đã thiết lập kênh NSFW! Bot sẽ gửi ảnh NSFW từ Waifu.pics.');
            cron.schedule('0 */30 * * * *', async () => {
                const channel = client.channels.cache.get(config.nsfwChannelId);
                if (channel) {
                    await sendNSFWAnime(channel);
                }
            }, {
                timezone: 'Asia/Ho_Chi_Minh'
            });
        } else {
            config.autoChannelId = message.channel.id;
            config.useNekos = true;
            await saveConfig();
            message.reply('✅ Đã thiết lập! Bot sẽ gửi ảnh ngẫu nhiên.');
            cron.schedule('0 */30 * * * *', async () => {
                const channel = client.channels.cache.get(config.autoChannelId);
                if (channel) {
                    await sendRandomAnime(channel);
                }
            }, {
                timezone: 'Asia/Ho_Chi_Minh'
            });
        }
    }

    if (command === 'unsetup') {
        if (!message.member.permissions.has('Administrator')) {
            return message.reply('Bạn cần quyền Admin để dùng lệnh này!');
        }

        if (message.channel.id === config.autoChannelId) {
            config.autoChannelId = null;
            await saveConfig();
            if (autoCronJob) {
                autoCronJob.stop();
                autoCronJob = null;
            }
            message.reply('✅ Đã xóa thiết lập kênh gửi ảnh ngẫu nhiên.');
        } else if (message.channel.id === config.nsfwChannelId) {
            config.nsfwChannelId = null;
            await saveConfig();
            if (nsfwCronJob) {
                nsfwCronJob.stop();
                nsfwCronJob = null;
            }
            message.reply('✅ Đã xóa thiết lập kênh NSFW.');
        } else {
            message.reply('❌ Kênh này chưa được thiết lập!');
        }
    }
    
    if (command === 'config') {
        if (!message.member.permissions.has('Administrator')) {
            return message.reply('Bạn cần quyền Admin để dùng lệnh này!');
        }

        if (args.length !== 4) {
            return message.reply('Vui lòng cung cấp tỷ lệ!');
        }

        const [anime, cute, furry, nsfw] = args.map(Number);
        if (isNaN(anime) || isNaN(cute) || isNaN(furry) || isNaN(nsfw)) {
            return message.reply('Tỷ lệ phải là số! Ví dụ: `!config 50 20 20 10`');
        }

        const total = anime + cute + furry + nsfw;
        if (Math.abs(total - 100) > 0.01) {
            return message.reply('Tổng tỷ lệ phải bằng 100%! Ví dụ: `!config 50 20 20 10`');
        }

        config.probAnime = anime / 100;
        config.probCute = cute / 100;
        config.probFurry = furry / 100;
        config.probNSFW = nsfw / 100;
        await saveConfig();
        message.reply(`✅ Đã cập nhật tỷ lệ: Anime=${anime}%, Cute=${cute}%, Furry=${furry}%, NSFW=${nsfw}%`);
    }
});

async function sendRandomAnime(channel) {
    let imageUrl = null;
    let source = config.useNekos ? 'Nekos.life' : 'Waifu.pics';
    let category = 'Anime';
    const history = await loadHistory();
    let attempts = 0;
    const maxAttempts = 10;

    let probAnime = config.probAnime;
    let probCute = config.probCute;
    let probFurry = config.probFurry;
    let probNSFW = config.probNSFW;
    if (!channel.nsfw) {
        const totalSFW = probAnime + probCute + probFurry;
        if (totalSFW > 0) {
            probAnime /= totalSFW;
            probCute /= totalSFW;
            probFurry /= totalSFW;
            probNSFW = 0;
        } else {
            probAnime = 1;
            probCute = 0;
            probFurry = 0;
            probNSFW = 0;
        }
    }

    while (attempts < maxAttempts) {
        attempts++;
        const random = Math.random();
        let endpoint;
        if (random < probAnime) {
            category = 'Anime';
            endpoint = config.useNekos ? 'https://nekos.life/api/v2/img/anime' : 'https://api.waifu.pics/sfw/waifu';
        } else if (random < probAnime + probCute) {
            category = 'Cute (Neko)';
            endpoint = config.useNekos ? 'https://nekos.life/api/v2/img/neko' : 'https://api.waifu.pics/sfw/waifu';
        } else if (random < probAnime + probCute + probFurry) {
            category = 'Furry';
            endpoint = config.useNekos ? 'https://nekos.life/api/v2/img/furry' : 'https://api.waifu.pics/sfw/waifu';
        } else if (channel.nsfw) {
            category = 'NSFW';
            endpoint = config.useNekos ? 'https://nekos.life/api/v2/img/lewd' : 'https://api.waifu.pics/nsfw/waifu';
        } else {
            category = 'Anime';
            endpoint = config.useNekos ? 'https://nekos.life/api/v2/img/anime' : 'https://api.waifu.pics/sfw/waifu';
        }

        try {
            const response = await fetch(endpoint);
            if (response.ok) {
                const data = await response.json();
                imageUrl = data.url;
                if (!history.includes(imageUrl)) {
                    history.push(imageUrl);
                    await saveHistory(history);
                    break;
                }
                imageUrl = null;
            }
        } catch (error) {
            console.error(`Lỗi API ${source} (${category}):`, error.message);
        }

        if (!imageUrl) {
            config.useNekos = !config.useNekos;
            source = config.useNekos ? 'Nekos.life' : 'Waifu.pics';
        }
    }

    if (!imageUrl) {
        channel.send('❌ Không lấy được ảnh mới từ API! Thử lại sau.');
        return;
    }

    config.useNekos = !config.useNekos;
    await saveConfig();

    const embed = new EmbedBuilder()
        .setTitle(`🎌 Ảnh Ngẫu Nhiên!`)
        .setImage(imageUrl)
        .setColor('#FF69B4')
        .setFooter({ text: `GBot Nude` })
        .setTimestamp();

    await channel.send({ embeds: [embed] });
}

async function sendNSFWAnime(channel) {
    let imageUrl = null;
    const source = 'Waifu.pics';
    let category = config.useTrap ? 'NSFW (Trap)' : 'NSFW (Waifu)';
    const history = await loadHistory();
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
        attempts++;
        const endpoint = config.useTrap ? 'https://api.waifu.pics/nsfw/trap' : 'https://api.waifu.pics/nsfw/waifu';

        try {
            const response = await fetch(endpoint);
            if (response.ok) {
                const data = await response.json();
                imageUrl = data.url;
                if (!history.includes(imageUrl)) {
                    history.push(imageUrl);
                    await saveHistory(history);
                    break;
                }
                imageUrl = null;
            }
        } catch (error) {
            console.error(`Lỗi API ${source} (${category}):`, error.message);
        }
    }

    if (!imageUrl) {
        channel.send('❌ Không lấy được ảnh NSFW từ Waifu.pics! Thử lại sau.');
        return;
    }

    config.useTrap = !config.useTrap;
    await saveConfig();

    const embed = new EmbedBuilder()
        .setTitle(`🔞 ${category}`)
        .setImage(imageUrl)
        .setColor('#FF69B4')
        .setFooter({ text: `GBot Nude` })
        .setTimestamp();

    await channel.send({ embeds: [embed] });
}

client.login(TOKEN);
