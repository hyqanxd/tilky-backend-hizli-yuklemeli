const axios = require('axios');
const querystring = require('querystring');

// Patreon OAuth URL oluştur
const createOAuthUrl = (amount, metadata) => {
  const state = Math.random().toString(36).substring(7);
  const params = {
    response_type: 'code',
    client_id: process.env.PATREON_CLIENT_ID,
    redirect_uri: process.env.PATREON_REDIRECT_URI,
    scope: 'identity identity[email] identity.memberships campaigns campaigns.members',
    state
  };

  // Patreon ödeme sayfası URL'i
  const url = `${process.env.PATREON_CAMPAIGN_ID}?${querystring.stringify(params)}`;
  
  console.log('Patreon payment URL created:', {
    redirect_uri: params.redirect_uri,
    state: state,
    amount: amount,
    return_url: `${process.env.CLIENT_URL}/donation/callback?state=${state}`
  });

  return { url, state };
};

// Access token al
const getAccessToken = async (code) => {
  try {
    if (!code) {
      throw new Error('Authorization code is required');
    }

    console.log('Requesting access token with code:', code);

    const tokenData = {
      code,
      grant_type: 'authorization_code',
      client_id: process.env.PATREON_CLIENT_ID,
      client_secret: process.env.PATREON_CLIENT_SECRET,
      redirect_uri: process.env.PATREON_REDIRECT_URI
    };

    const response = await axios.post(
      'https://www.patreon.com/api/oauth2/token',
      querystring.stringify(tokenData),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    if (!response.data || !response.data.access_token) {
      throw new Error('Invalid token response');
    }

    console.log('Access token obtained successfully');
    return response.data.access_token;
  } catch (error) {
    console.error('Token request failed:', {
      status: error.response?.status,
      error: error.response?.data?.error,
      error_description: error.response?.data?.error_description
    });
    throw error;
  }
};

// Patreon ödeme oturumu oluştur
const createPatreonPayment = async ({ amount, description, metadata = {} }) => {
  try {
    if (!process.env.PATREON_CAMPAIGN_ID) {
      throw new Error('PATREON_CAMPAIGN_ID is required');
    }

    // Ödeme URL'i oluştur
    const { url, state } = createOAuthUrl(amount, {
      ...metadata,
      description
    });
    
    // Ödeme oturumu oluştur
    const session = {
      id: state,
      url,
      state,
      amount,
      description,
      metadata
    };

    console.log('Payment session created:', {
      id: session.id,
      amount: session.amount,
      description: session.description,
      url: session.url
    });

    return session;
  } catch (error) {
    console.error('Error creating payment session:', error);
    throw error;
  }
};

// Patreon ödeme doğrulama
const verifyPatreonPayment = async (accessToken) => {
  try {
    if (!accessToken) {
      throw new Error('Access token is required');
    }

    console.log('Verifying payment with token:', accessToken.substring(0, 10) + '...');

    // Kullanıcı bilgilerini ve üyelik durumunu al
    const userResponse = await axios.get(
      'https://www.patreon.com/api/oauth2/v2/identity?include=memberships',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    if (!userResponse.data || !userResponse.data.data) {
      throw new Error('Invalid identity response');
    }

    const userData = userResponse.data.data;
    const memberships = userResponse.data.included || [];

    // Kampanya üyeliğini kontrol et
    const campaignId = process.env.PATREON_CAMPAIGN_ID;
    const activeMembership = memberships.find(membership => 
      membership.relationships?.campaign?.data?.id === campaignId &&
      membership.attributes?.patron_status === 'active_patron'
    );

    console.log('Payment verification result:', {
      userId: userData.id,
      hasMembership: !!activeMembership,
      membershipStatus: activeMembership?.attributes?.patron_status
    });

    return !!activeMembership;
  } catch (error) {
    console.error('Payment verification failed:', {
      status: error.response?.status,
      error: error.response?.data?.error
    });
    return false;
  }
};

// Patreon kampanya bilgilerini al
const getCampaignInfo = async (accessToken) => {
  try {
    const response = await axios.get(
      `https://www.patreon.com/api/oauth2/v2/campaigns/${process.env.PATREON_CAMPAIGN_ID}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    return response.data.data;
  } catch (error) {
    console.error('Error getting campaign info:', error);
    throw error;
  }
};

module.exports = {
  createPatreonPayment,
  verifyPatreonPayment,
  getAccessToken,
  createOAuthUrl,
  getCampaignInfo
}; 