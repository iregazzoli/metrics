import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Logger } from '@nestjs/common';
import { AlbumMetricsConsumer } from './album-metrics.consumer';
import { AlbumMetric } from '../entities/album-metric.entity';

// Mock amqp-connection-manager
jest.mock('amqp-connection-manager', () => {
  const mockChannelWrapper = {
    addSetup: jest.fn().mockResolvedValue(undefined),
    ack: jest.fn(),
    nack: jest.fn(),
  };

  const mockConnection = {
    createChannel: jest.fn().mockReturnValue(mockChannelWrapper),
  };

  return {
    connect: jest.fn().mockReturnValue(mockConnection),
  };
});

describe('AlbumMetricsConsumer', () => {
  let consumer: AlbumMetricsConsumer;
  let mockAlbumModel: any;

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(async () => {
    const createMockModel = () => {
      const model: any = jest.fn();
      model.findOne = jest.fn().mockReturnValue({
        exec: jest.fn(),
      });
      return model;
    };

    mockAlbumModel = createMockModel();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlbumMetricsConsumer,
        {
          provide: getModelToken(AlbumMetric.name),
          useValue: mockAlbumModel,
        },
      ],
    }).compile();

    consumer = module.get<AlbumMetricsConsumer>(AlbumMetricsConsumer);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleAlbumMetric', () => {
    const createMockMessage = (content: any) =>
      ({
        content: Buffer.from(JSON.stringify(content)),
      }) as any;

    it('should increment album likes when processing like metric', async () => {
      const albumId = 'test-album-id';
      const existingAlbum = {
        albumId,
        likes: 10,
        shares: 5,
        save: jest.fn().mockResolvedValue(true),
      };

      mockAlbumModel.findOne.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValue(existingAlbum),
      });

      const message = createMockMessage({
        albumId,
        metricType: 'like',
        timestamp: new Date(),
      });

      await consumer.handleAlbumMetric(message);

      expect(mockAlbumModel.findOne).toHaveBeenCalledWith({ albumId });
      expect(existingAlbum.likes).toBe(11);
      expect(existingAlbum.save).toHaveBeenCalled();
    });

    it('should increment album shares when processing share metric', async () => {
      const albumId = 'test-album-id';
      const existingAlbum = {
        albumId,
        likes: 10,
        shares: 5,
        save: jest.fn().mockResolvedValue(true),
      };

      mockAlbumModel.findOne.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValue(existingAlbum),
      });

      const message = createMockMessage({
        albumId,
        metricType: 'share',
        timestamp: new Date(),
      });

      await consumer.handleAlbumMetric(message);

      expect(mockAlbumModel.findOne).toHaveBeenCalledWith({ albumId });
      expect(existingAlbum.shares).toBe(6);
      expect(existingAlbum.save).toHaveBeenCalled();
    });

    it('should skip processing when album does not exist', async () => {
      const albumId = 'nonexistent-album-id';

      mockAlbumModel.findOne.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValue(null),
      });

      const message = createMockMessage({
        albumId,
        metricType: 'like',
        timestamp: new Date(),
      });

      await consumer.handleAlbumMetric(message);

      expect(mockAlbumModel.findOne).toHaveBeenCalledWith({ albumId });
      // Should not save anything since album doesn't exist
    });

    it('should handle unknown metric types gracefully', async () => {
      const albumId = 'test-album-id';
      const existingAlbum = {
        albumId,
        likes: 10,
        shares: 5,
        save: jest.fn().mockResolvedValue(true),
      };

      mockAlbumModel.findOne.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValue(existingAlbum),
      });

      const message = createMockMessage({
        albumId,
        metricType: 'unknown',
        timestamp: new Date(),
      });

      await consumer.handleAlbumMetric(message);

      expect(mockAlbumModel.findOne).toHaveBeenCalledWith({ albumId });
      expect(existingAlbum.save).not.toHaveBeenCalled();
      // Original values should remain unchanged
      expect(existingAlbum.likes).toBe(10);
      expect(existingAlbum.shares).toBe(5);
    });

    it('should handle processing errors gracefully', async () => {
      const albumId = 'test-album-id';

      mockAlbumModel.findOne.mockReturnValueOnce({
        exec: jest.fn().mockRejectedValue(new Error('Database error')),
      });

      const message = createMockMessage({
        albumId,
        metricType: 'like',
        timestamp: new Date(),
      });

      // Should not throw, but handle error internally
      await expect(consumer.handleAlbumMetric(message)).resolves.not.toThrow();
    });
  });
});
