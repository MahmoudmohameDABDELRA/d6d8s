import * as socialService from '../../services/social.service.js';
import asyncHandler from '../../utils/asyncHandler.js';

/**
 * ════════════════════════════════════════════════════════════
 *  كنترولر منظومة التواصل والخصوصية — Social Controller
 * ════════════════════════════════════════════════════════════
 */

export const updatePrivacy = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const result = await socialService.updatePrivacySettings(userId, req.body ?? {});
  res.status(200).json(result);
});

export const updateStatus = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const result = await socialService.updateCustomStatus(userId, req.body ?? {});
  res.status(200).json(result);
});

export const followUser = asyncHandler(async (req, res) => {
  const followerId = req.user.userId;
  const { targetUserId } = req.params;
  const result = await socialService.followUser(followerId, targetUserId);
  res.status(200).json(result);
});

export const unfollowUser = asyncHandler(async (req, res) => {
  const followerId = req.user.userId;
  const { targetUserId } = req.params;
  const result = await socialService.unfollowUser(followerId, targetUserId);
  res.status(200).json(result);
});

export const respondFollowRequest = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { requestId } = req.params;
  const { action } = req.body ?? {};
  const result = await socialService.respondToFollowRequest(userId, requestId, action);
  res.status(200).json(result);
});

export const listRequests = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const result = await socialService.listFollowRequests(userId);
  res.status(200).json(result);
});

export const getProfile = asyncHandler(async (req, res) => {
  const viewerId = req.user.userId;
  const { userId } = req.params;
  const result = await socialService.getUserProfile(viewerId, userId);
  res.status(200).json(result);
});

export const getFollowers = asyncHandler(async (req, res) => {
  const viewerId = req.user.userId;
  const { userId } = req.params;
  const { page, limit } = req.query;
  const result = await socialService.listFollowers(viewerId, userId, { page, limit });
  res.status(200).json(result);
});

export const getFollowing = asyncHandler(async (req, res) => {
  const viewerId = req.user.userId;
  const { userId } = req.params;
  const { page, limit } = req.query;
  const result = await socialService.listFollowing(viewerId, userId, { page, limit });
  res.status(200).json(result);
});

export const createReport = asyncHandler(async (req, res) => {
  const reporterId = req.user.userId;
  const result = await socialService.createReport(reporterId, req.body ?? {});
  res.status(201).json(result);
});

export const listAdminReports = asyncHandler(async (req, res) => {
  const { status, page, limit } = req.query;
  const result = await socialService.listAdminReports({ status, page, limit });
  res.status(200).json(result);
});

export const resolveAdminReport = asyncHandler(async (req, res) => {
  const { reportId } = req.params;
  const result = await socialService.resolveAdminReport(reportId, req.body ?? {});
  res.status(200).json(result);
});

export default {
  updatePrivacy,
  updateStatus,
  followUser,
  unfollowUser,
  respondFollowRequest,
  listRequests,
  getProfile,
  getFollowers,
  getFollowing,
  createReport,
  listAdminReports,
  resolveAdminReport,
};
