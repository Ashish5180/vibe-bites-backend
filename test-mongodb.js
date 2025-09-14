const mongoose = require('mongoose');

// Test MongoDB connection
const testConnection = async () => {
  const uri = 'mongodb+srv://support_db_user:kKmBNdzG1zoSqP73@cluster0.cyoh47j.mongodb.net/vibebites?retryWrites=true&w=majority&appName=Cluster0';
  
  console.log('Testing MongoDB connection...');
  console.log('URI:', uri.replace(/\/\/.*@/, '//***:***@')); // Hide credentials
  
  try {
    await mongoose.connect(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ MongoDB connected successfully!');
    
    // Test a simple operation
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('📊 Available collections:', collections.map(c => c.name));
    
    await mongoose.disconnect();
    console.log('✅ Connection test completed successfully!');
  } catch (error) {
    console.error('❌ MongoDB connection failed:');
    console.error('Error:', error.message);
    console.error('Code:', error.code);
    
    if (error.code === 'ENOTFOUND') {
      console.log('🔍 Issue: DNS resolution failed - check cluster URL');
    } else if (error.code === 'EAUTH') {
      console.log('🔍 Issue: Authentication failed - check username/password');
    } else if (error.code === 'ETIMEOUT') {
      console.log('🔍 Issue: Connection timeout - check network access');
    }
  }
};

testConnection();
