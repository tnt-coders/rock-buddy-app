export class UserData {
  public static async get(key: string): Promise<string | null> {
    const userId = sessionStorage.getItem('user_id');

    if (userId !== null) {
      return await window.api.storeGet('user_data.' + userId + '.' + key);
    }
    else {
      throw new Error('Failed to get user data: No user has been established for the current session.');
    }
  }

  public static async set(key: string, value: string): Promise<void> {
    const userId = sessionStorage.getItem('user_id');

    if (userId !== null) {
      window.api.storeSet('user_data.' + userId + '.' + key, value);
    }
    else {
      throw new Error('Failed to set user data: No user has been established for the current session.');
    }
  }
}