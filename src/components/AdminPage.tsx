import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import {
  Shield, Users, AlertCircle, Loader2, Trash2, UserCheck, UserX
} from 'lucide-react';
import { api, User } from '../utils/api';

interface AdminPageProps {
  onNavigate: (page: any) => void;
  currentUser: User | null;
}

export function AdminPage({ onNavigate, currentUser }: AdminPageProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const userList = await api.listUsers();
      setUsers(userList);
    } catch (err: any) {
      setError(err.message || 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangeRole = async (userId: number, newRole: string) => {
    setError(null);
    setSuccess(null);

    try {
      const updatedUser = await api.changeUserRole(userId, newRole);
      setUsers(prev =>
        prev.map(u => (u.id === userId ? updatedUser : u))
      );
      setSuccess(`Role of "${updatedUser.username}" changed to "${newRole}"`);
    } catch (err: any) {
      setError(err.message || 'Failed to change role');
    }
  };

  const handleDeleteUser = async (userId: number, username: string) => {
    if (!confirm(`Are you sure you want to delete user "${username}"? This action cannot be undone.`)) {
      return;
    }

    setError(null);
    setSuccess(null);

    try {
      await api.deleteUser(userId);
      setUsers(prev => prev.filter(u => u.id !== userId));
      setSuccess(`User "${username}" has been deleted`);
    } catch (err: any) {
      setError(err.message || 'Failed to delete user');
    }
  };

  const stats = {
    total: users.length,
    admins: users.filter(u => u.role === 'admin').length,
    regularUsers: users.filter(u => u.role === 'user').length,
  };

  return (
    <div className="min-h-screen bg-secondary/10 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2 flex items-center gap-3">
            <Shield className="w-8 h-8" />
            Admin Panel
          </h1>
          <p className="text-muted-foreground">
            Manage users, roles, and permissions
          </p>
        </div>

        {/* Alerts */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <Alert className="mb-6 border-green-500 bg-green-50">
            <UserCheck className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">{success}</AlertDescription>
          </Alert>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Users</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
                <Users className="w-8 h-8 text-primary" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Admins</p>
                  <p className="text-2xl font-bold">{stats.admins}</p>
                </div>
                <Shield className="w-8 h-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Regular Users</p>
                  <p className="text-2xl font-bold">{stats.regularUsers}</p>
                </div>
                <UserCheck className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Users Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              User Management
            </CardTitle>
            <CardDescription>
              View and manage user roles. Changes take effect immediately.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12">
                <Loader2 className="w-12 h-12 text-primary mx-auto mb-4 animate-spin" />
                <p className="text-muted-foreground">Loading users...</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 font-semibold text-sm">ID</th>
                      <th className="text-left py-3 px-4 font-semibold text-sm">Username</th>
                      <th className="text-left py-3 px-4 font-semibold text-sm">Email</th>
                      <th className="text-left py-3 px-4 font-semibold text-sm">Role</th>
                      <th className="text-right py-3 px-4 font-semibold text-sm">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => {
                      const isSelf = u.id === currentUser?.id;

                      return (
                        <tr key={u.id} className="border-b hover:bg-accent/50 transition-colors">
                          <td className="py-3 px-4 text-sm text-muted-foreground">#{u.id}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{u.username}</span>
                              {isSelf && (
                                <Badge variant="outline" className="text-xs">You</Badge>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-sm text-muted-foreground">{u.email}</td>
                          <td className="py-3 px-4">
                            <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>
                              {u.role}
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-end gap-2">
                              {/* Toggle role */}
                              {u.role === 'user' ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleChangeRole(u.id, 'admin')}
                                  title="Promote to Admin"
                                >
                                  <UserCheck className="w-4 h-4 mr-1" />
                                  Make Admin
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleChangeRole(u.id, 'user')}
                                  disabled={isSelf}
                                  title={isSelf ? "Can't demote yourself" : 'Demote to User'}
                                >
                                  <UserX className="w-4 h-4 mr-1" />
                                  Make User
                                </Button>
                              )}

                              {/* Delete */}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDeleteUser(u.id, u.username)}
                                disabled={isSelf}
                                title={isSelf ? "Can't delete yourself" : 'Delete user'}
                                className="hover:bg-destructive/10 hover:text-destructive"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}