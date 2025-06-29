// Debug media data to check what information is available for filters
const { sequelize, Media } = require('./database');

async function debugMediaData() {
  try {
    console.log('Starting media data debugging...');
    
    // Get all media records
    const allMedia = await Media.findAll({
      limit: 10 // Just get first 10 for debugging
    });
    
    console.log(`\n=== Found ${allMedia.length} media records (showing first 10) ===`);
    
    allMedia.forEach((media, index) => {
      console.log(`\n--- Media Record ${index + 1} ---`);
      console.log(`ID: ${media.id}`);
      console.log(`Type: ${media.type}`);
      console.log(`Title: ${media.title || 'N/A'}`);
      console.log(`Filename: ${media.filename}`);
      console.log(`Size: ${media.size} bytes`);
      console.log(`Created: ${media.created}`);
      console.log(`Watched: ${media.watched}`);
      console.log(`Protected: ${media.protected}`);
      console.log(`Year: ${media.year || 'N/A'}`);
      console.log(`Rating: ${media.rating || 'N/A'}`);
      console.log(`Metadata:`, JSON.stringify(media.metadata, null, 2));
    });
    
    // Check for specific filter data availability
    console.log('\n=== Filter Data Analysis ===');
    
    const totalCount = await Media.count();
    console.log(`Total media records: ${totalCount}`);
    
    // Check rating data
    const withRating = await Media.count({
      where: {
        rating: {
          [sequelize.Sequelize.Op.not]: null
        }
      }
    });
    
    const withMetadataRating = await sequelize.query(`
      SELECT COUNT(*) as count 
      FROM Media 
      WHERE JSON_EXTRACT(metadata, '$.rating') IS NOT NULL
    `, { type: sequelize.QueryTypes.SELECT });
    
    console.log(`Records with rating field: ${withRating}`);
    console.log(`Records with metadata.rating: ${withMetadataRating[0].count}`);
    
    // Check watched status
    const watchedCount = await Media.count({
      where: { watched: true }
    });
    const unwatchedCount = await Media.count({
      where: { watched: false }
    });
    
    console.log(`Watched records: ${watchedCount}`);
    console.log(`Unwatched records: ${unwatchedCount}`);
    
    // Check size data
    const withSize = await Media.count({
      where: {
        size: {
          [sequelize.Sequelize.Op.gt]: 0
        }
      }
    });
    
    console.log(`Records with size > 0: ${withSize}`);
    
    // Check by type
    const movieCount = await Media.count({ where: { type: 'movie' } });
    const showCount = await Media.count({ where: { type: 'show' } });
    const otherCount = await Media.count({ 
      where: { 
        type: {
          [sequelize.Sequelize.Op.notIn]: ['movie', 'show']
        }
      }
    });
    
    console.log(`Movies: ${movieCount}`);
    console.log(`Shows: ${showCount}`);
    console.log(`Other: ${otherCount}`);
    
    // Sample some records with different characteristics
    console.log('\n=== Sample Records for Filter Testing ===');
    
    const sampleMovie = await Media.findOne({
      where: { type: 'movie' }
    });
    
    if (sampleMovie) {
      console.log('\nSample Movie:');
      console.log(`  Title: ${sampleMovie.title || sampleMovie.filename}`);
      console.log(`  Size: ${sampleMovie.size} bytes (${(sampleMovie.size / (1024*1024*1024)).toFixed(2)} GB)`);
      console.log(`  Rating: ${sampleMovie.rating || 'N/A'}`);
      console.log(`  Metadata Rating: ${sampleMovie.metadata?.rating || 'N/A'}`);
      console.log(`  Watched: ${sampleMovie.watched}`);
      console.log(`  Created: ${sampleMovie.created}`);
    }
    
    const sampleShow = await Media.findOne({
      where: { type: 'show' }
    });
    
    if (sampleShow) {
      console.log('\nSample Show:');
      console.log(`  Title: ${sampleShow.title || sampleShow.filename}`);
      console.log(`  Size: ${sampleShow.size} bytes (${(sampleShow.size / (1024*1024*1024)).toFixed(2)} GB)`);
      console.log(`  Rating: ${sampleShow.rating || 'N/A'}`);
      console.log(`  Metadata Rating: ${sampleShow.metadata?.rating || 'N/A'}`);
      console.log(`  Watched: ${sampleShow.watched}`);
      console.log(`  Created: ${sampleShow.created}`);
    }
    
    console.log('\n=== Media data debugging completed ===');
    process.exit(0);
  } catch (error) {
    console.error('Error during media data debugging:', error);
    process.exit(1);
  }
}

// Run the debug if this script is executed directly
if (require.main === module) {
  debugMediaData();
}

module.exports = { debugMediaData };
