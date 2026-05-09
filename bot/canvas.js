const { createCanvas, loadImage } = require('canvas');

module.exports = async (member) => {
    const canvas = createCanvas(700, 250);
    const ctx = canvas.getContext('2d');

    // Background (Gradient màu xanh tím than hiện đại)
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, '#5865F2');
    gradient.addColorStop(1, '#eb459e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Tải Avatar
    const avatar = await loadImage(member.user.displayAvatarURL({ format: 'png', size: 128 }));
    
    // Vẽ hình tròn cho Avatar
    ctx.beginPath();
    ctx.arc(125, 125, 80, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, 45, 45, 160, 160);
    
    // Vẽ viền avatar
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 10;
    ctx.stroke();

    // Text chào mừng
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText('WELCOME', 250, 90);

    ctx.font = '30px sans-serif';
    ctx.fillText(member.user.tag, 250, 140);

    ctx.font = '20px sans-serif';
    ctx.fillText(`You are the ${member.guild.memberCount}th member!`, 250, 180);

    return canvas.toBuffer();
};
